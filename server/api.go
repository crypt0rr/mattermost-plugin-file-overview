package main

import (
	"encoding/json"
	"net/http"
	"strconv"

	"github.com/gorilla/mux"
	"github.com/mattermost/mattermost/server/public/model"
)

const (
	defaultFilesPerPage = 50
	maxFilesPerPage     = 100
)

// fileAPI is the small part of the Mattermost plugin API used by the endpoint.
// Keeping this interface narrow makes authorization and pagination testable
// without a running Mattermost server.
type fileAPI interface {
	HasPermissionToChannel(userID, channelID string, permission *model.Permission) bool
	GetFileInfos(page, perPage int, opt *model.GetFileInfosOptions) ([]*model.FileInfo, *model.AppError)
}

type fileOverviewItem struct {
	ID              string `json:"id"`
	PostID          string `json:"post_id"`
	ChannelID       string `json:"channel_id"`
	CreatorID       string `json:"creator_id"`
	CreateAt        int64  `json:"create_at"`
	Name            string `json:"name"`
	Extension       string `json:"extension"`
	Size            int64  `json:"size"`
	MimeType        string `json:"mime_type"`
	HasPreviewImage bool   `json:"has_preview_image"`
}

type channelFilesResponse struct {
	Items   []fileOverviewItem `json:"items"`
	Page    int                `json:"page"`
	PerPage int                `json:"per_page"`
	HasMore bool               `json:"has_more"`
}

type filesQuery struct {
	page           int
	perPage        int
	sortBy         string
	sortDescending bool
}

type fileEndpoint struct {
	api fileAPI
}

// initRouter initializes the plugin HTTP routes.
func (p *Plugin) initRouter() *mux.Router {
	router := mux.NewRouter()
	router.Use(p.mattermostAuthorizationRequired)

	apiRouter := router.PathPrefix("/api/v1").Subrouter()
	apiRouter.HandleFunc("/channels/{channel_id}/files", p.serveChannelFiles).Methods(http.MethodGet)

	return router
}

func (p *Plugin) mattermostAuthorizationRequired(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.Header.Get("Mattermost-User-Id") == "" {
			http.Error(w, "Not authorized", http.StatusUnauthorized)
			return
		}

		next.ServeHTTP(w, r)
	})
}

func (p *Plugin) serveChannelFiles(w http.ResponseWriter, r *http.Request) {
	fileEndpoint{api: p.API}.serveChannelFiles(w, r)
}

func (h fileEndpoint) serveChannelFiles(w http.ResponseWriter, r *http.Request) {
	channelID := mux.Vars(r)["channel_id"]
	if !model.IsValidId(channelID) {
		http.Error(w, "Invalid channel_id", http.StatusBadRequest)
		return
	}

	query, err := parseFilesQuery(r)
	if err != nil {
		http.Error(w, err.Error(), http.StatusBadRequest)
		return
	}

	userID := r.Header.Get("Mattermost-User-Id")
	if userID == "" {
		http.Error(w, "Not authorized", http.StatusUnauthorized)
		return
	}
	if h.api == nil || !h.api.HasPermissionToChannel(userID, channelID, model.PermissionReadChannel) {
		http.Error(w, "Forbidden", http.StatusForbidden)
		return
	}

	fileInfos, appErr := h.api.GetFileInfos(query.page, query.perPage+1, &model.GetFileInfosOptions{
		ChannelIds:     []string{channelID},
		IncludeDeleted: false,
		SortBy:         query.sortBy,
		SortDescending: query.sortDescending,
	})
	if appErr != nil {
		if logger, ok := h.api.(interface{ LogError(string, ...any) }); ok {
			logger.LogError("Failed to list channel files", "channel_id", channelID, "error_id", appErr.Id)
		}
		http.Error(w, "Unable to load channel files", http.StatusInternalServerError)
		return
	}

	visibleFileInfos := make([]*model.FileInfo, 0, len(fileInfos))
	for _, fileInfo := range fileInfos {
		if fileInfo != nil && fileInfo.DeleteAt == 0 {
			visibleFileInfos = append(visibleFileInfos, fileInfo)
		}
	}

	hasMore := len(visibleFileInfos) > query.perPage
	if hasMore {
		visibleFileInfos = visibleFileInfos[:query.perPage]
	}

	items := make([]fileOverviewItem, 0, len(visibleFileInfos))
	for _, fileInfo := range visibleFileInfos {
		items = append(items, fileOverviewItem{
			ID:              fileInfo.Id,
			PostID:          fileInfo.PostId,
			ChannelID:       fileInfo.ChannelId,
			CreatorID:       fileInfo.CreatorId,
			CreateAt:        fileInfo.CreateAt,
			Name:            fileInfo.Name,
			Extension:       fileInfo.Extension,
			Size:            fileInfo.Size,
			MimeType:        fileInfo.MimeType,
			HasPreviewImage: fileInfo.HasPreviewImage,
		})
	}

	writeJSON(w, channelFilesResponse{
		Items:   items,
		Page:    query.page,
		PerPage: query.perPage,
		HasMore: hasMore,
	})
}

func parseFilesQuery(r *http.Request) (filesQuery, error) {
	query := filesQuery{
		page:    0,
		perPage: defaultFilesPerPage,
		sortBy:  model.FileinfoSortByCreated,
	}

	values := r.URL.Query()
	if raw := values.Get("page"); raw != "" {
		page, err := strconv.Atoi(raw)
		if err != nil || page < 0 {
			return filesQuery{}, invalidQueryError("page must be a non-negative integer")
		}
		query.page = page
	}
	if raw := values.Get("per_page"); raw != "" {
		perPage, err := strconv.Atoi(raw)
		if err != nil || perPage < 1 || perPage > maxFilesPerPage {
			return filesQuery{}, invalidQueryError("per_page must be between 1 and 100")
		}
		query.perPage = perPage
	}

	switch values.Get("sort") {
	case "", "create_at":
		query.sortBy = model.FileinfoSortByCreated
	case "size":
		query.sortBy = model.FileinfoSortBySize
	default:
		return filesQuery{}, invalidQueryError("sort must be create_at or size")
	}

	switch values.Get("direction") {
	case "", "desc":
		query.sortDescending = true
	case "asc":
		query.sortDescending = false
	default:
		return filesQuery{}, invalidQueryError("direction must be asc or desc")
	}

	return query, nil
}

type invalidQueryError string

func (e invalidQueryError) Error() string {
	return string(e)
}

func writeJSON(w http.ResponseWriter, value any) {
	w.Header().Set("Content-Type", "application/json")
	_ = json.NewEncoder(w).Encode(value)
}
