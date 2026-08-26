package main

import (
	"encoding/json"
	"fmt"
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/gorilla/mux"
	hashicorpplugin "github.com/hashicorp/go-plugin"
	"github.com/mattermost/mattermost/server/public/model"
	"github.com/mattermost/mattermost/server/public/plugin/plugintest"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/mock"
	"github.com/stretchr/testify/require"
)

const testChannelID = "aaaaaaaaaaaaaaaaaaaaaaaaaa"

type fakeFileAPI struct {
	allowed     bool
	fileInfos   []*model.FileInfo
	appErr      *model.AppError
	lastPage    int
	lastPerPage int
	lastOptions *model.GetFileInfosOptions
	logMessage  string
	logArgs     []any
}

func (f *fakeFileAPI) HasPermissionToChannel(_, _ string, _ *model.Permission) bool {
	return f.allowed
}

func (f *fakeFileAPI) GetFileInfos(page, perPage int, options *model.GetFileInfosOptions) ([]*model.FileInfo, *model.AppError) {
	f.lastPage = page
	f.lastPerPage = perPage
	f.lastOptions = options
	return f.fileInfos, f.appErr
}

func (f *fakeFileAPI) LogError(message string, args ...any) {
	f.logMessage = message
	f.logArgs = args
}

func requestForChannel(path string) *http.Request {
	r := httptest.NewRequest(http.MethodGet, path, nil)
	r.Header.Set("Mattermost-User-Id", "user-id")
	return r
}

func withChannelID(r *http.Request, channelID string) *http.Request {
	return mux.SetURLVars(r, map[string]string{"channel_id": channelID})
}

func TestServeChannelFilesReturnsAuthorizedMetadataAndPagination(t *testing.T) {
	api := &fakeFileAPI{
		allowed: true,
		fileInfos: []*model.FileInfo{
			{Id: "file-1", PostId: "post-1", ChannelId: testChannelID, CreatorId: "user-1", Name: "one.txt", Extension: "txt", Size: 12, MimeType: "text/plain", CreateAt: 100},
			{Id: "file-2", PostId: "post-1", ChannelId: testChannelID, CreatorId: "user-2", Name: "two.png", Extension: "png", Size: 24, MimeType: "image/png", CreateAt: 200, HasPreviewImage: true},
			{Id: "file-3", PostId: "post-2", ChannelId: testChannelID, CreatorId: "user-1", Name: "three.pdf", Extension: "pdf", Size: 36, MimeType: "application/pdf", CreateAt: 300},
		},
	}
	r := withChannelID(requestForChannel("/api/v1/channels/"+testChannelID+"/files?page=2&per_page=2&sort=size&direction=asc"), testChannelID)
	w := httptest.NewRecorder()

	fileEndpoint{api: api}.serveChannelFiles(w, r)

	assert.Equal(t, http.StatusOK, w.Code)
	assert.Equal(t, "application/json", w.Header().Get("Content-Type"))
	assert.Equal(t, 2, api.lastPage)
	assert.Equal(t, 3, api.lastPerPage)
	require.NotNil(t, api.lastOptions)
	assert.Equal(t, []string{testChannelID}, api.lastOptions.ChannelIds)
	assert.False(t, api.lastOptions.IncludeDeleted)
	assert.Equal(t, model.FileinfoSortBySize, api.lastOptions.SortBy)
	assert.False(t, api.lastOptions.SortDescending)

	var response channelFilesResponse
	require.NoError(t, json.NewDecoder(w.Body).Decode(&response))
	assert.Equal(t, 2, response.Page)
	assert.Equal(t, 2, response.PerPage)
	assert.True(t, response.HasMore)
	assert.Len(t, response.Items, 2)
	assert.Equal(t, "file-1", response.Items[0].ID)
	assert.Equal(t, "file-2", response.Items[1].ID)
}

func TestServeChannelFilesRejectsUnauthorizedUser(t *testing.T) {
	api := &fakeFileAPI{allowed: false}
	r := withChannelID(requestForChannel("/api/v1/channels/"+testChannelID+"/files"), testChannelID)
	w := httptest.NewRecorder()

	fileEndpoint{api: api}.serveChannelFiles(w, r)

	assert.Equal(t, http.StatusForbidden, w.Code)
	assert.Nil(t, api.lastOptions)
}

func TestServeChannelFilesRejectsInvalidQuery(t *testing.T) {
	api := &fakeFileAPI{allowed: true}
	queries := []string{
		"?page=-1",
		"?per_page=0",
		"?per_page=101",
		"?sort=name",
		"?direction=sideways",
	}

	for _, query := range queries {
		t.Run(query, func(t *testing.T) {
			r := withChannelID(requestForChannel("/api/v1/channels/"+testChannelID+"/files"+query), testChannelID)
			w := httptest.NewRecorder()

			fileEndpoint{api: api}.serveChannelFiles(w, r)

			assert.Equal(t, http.StatusBadRequest, w.Code)
		})
	}
}

func TestServeChannelFilesRequiresAuthentication(t *testing.T) {
	api := &fakeFileAPI{allowed: true}
	r := withChannelID(httptest.NewRequest(http.MethodGet, "/api/v1/channels/"+testChannelID+"/files", nil), testChannelID)
	w := httptest.NewRecorder()

	fileEndpoint{api: api}.serveChannelFiles(w, r)

	assert.Equal(t, http.StatusUnauthorized, w.Code)
}

func TestServeChannelFilesSanitizesMattermostErrors(t *testing.T) {
	api := &fakeFileAPI{
		allowed: true,
		appErr:  model.NewAppError("GetFileInfos", "internal.file.error", nil, "secret filename", http.StatusInternalServerError),
	}
	r := withChannelID(requestForChannel("/api/v1/channels/"+testChannelID+"/files"), testChannelID)
	w := httptest.NewRecorder()

	fileEndpoint{api: api}.serveChannelFiles(w, r)

	assert.Equal(t, http.StatusInternalServerError, w.Code)
	assert.NotContains(t, w.Body.String(), "secret filename")
	assert.NotContains(t, fmt.Sprint(api.logArgs), "secret filename")
	assert.Contains(t, fmt.Sprint(api.logArgs), "internal.file.error")
}

func TestServeChannelFilesRejectsMalformedChannelID(t *testing.T) {
	api := &fakeFileAPI{allowed: true}
	r := withChannelID(requestForChannel("/api/v1/channels/not-an-id/files"), "not-an-id")
	w := httptest.NewRecorder()

	fileEndpoint{api: api}.serveChannelFiles(w, r)

	assert.Equal(t, http.StatusBadRequest, w.Code)
	assert.Nil(t, api.lastOptions)
}

func TestServeChannelFilesExcludesDeletedFiles(t *testing.T) {
	api := &fakeFileAPI{
		allowed: true,
		fileInfos: []*model.FileInfo{
			{Id: "deleted", ChannelId: testChannelID, DeleteAt: 1},
			{Id: "visible", ChannelId: testChannelID},
		},
	}
	r := withChannelID(requestForChannel("/api/v1/channels/"+testChannelID+"/files?per_page=2"), testChannelID)
	w := httptest.NewRecorder()

	fileEndpoint{api: api}.serveChannelFiles(w, r)

	var response channelFilesResponse
	require.NoError(t, json.NewDecoder(w.Body).Decode(&response))
	assert.False(t, response.HasMore)
	require.Len(t, response.Items, 1)
	assert.Equal(t, "visible", response.Items[0].ID)
}

func TestPluginLifecycleAndHTTPRoute(t *testing.T) {
	api := &plugintest.API{}
	api.On("HasPermissionToChannel", "user-id", testChannelID, model.PermissionReadChannel).Return(true)
	api.On("GetFileInfos", 0, defaultFilesPerPage+1, mock.AnythingOfType("*model.GetFileInfosOptions")).Return([]*model.FileInfo{}, (*model.AppError)(nil))

	pluginInstance := &Plugin{}
	pluginInstance.SetAPI(api)
	require.NoError(t, pluginInstance.OnActivate())

	req := requestForChannel("/api/v1/channels/" + testChannelID + "/files")
	resp := httptest.NewRecorder()
	pluginInstance.ServeHTTP(nil, resp, req)

	assert.Equal(t, http.StatusOK, resp.Code)
	api.AssertExpectations(t)
	assert.NoError(t, pluginInstance.OnDeactivate())
}

func TestPluginHTTPRouteRequiresMattermostAuthentication(t *testing.T) {
	pluginInstance := &Plugin{}
	pluginInstance.SetAPI(&plugintest.API{})

	req := withChannelID(httptest.NewRequest(http.MethodGet, "/api/v1/channels/"+testChannelID+"/files", nil), testChannelID)
	resp := httptest.NewRecorder()
	pluginInstance.ServeHTTP(nil, resp, req)

	assert.Equal(t, http.StatusUnauthorized, resp.Code)
}

func TestMainEntrypointStartsThePluginImplementation(t *testing.T) {
	originalClientMain := clientMain
	defer func() {
		clientMain = originalClientMain
	}()

	var implementation any
	clientMain = func(candidate any, _ ...func(*hashicorpplugin.ServeConfig) error) {
		implementation = candidate
	}

	main()

	require.IsType(t, &Plugin{}, implementation)
}
