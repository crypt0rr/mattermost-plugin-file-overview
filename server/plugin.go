package main

import (
	"net/http"

	"github.com/gorilla/mux"
	"github.com/mattermost/mattermost/server/public/plugin"
)

// Plugin is the server-side part of File Overview. It intentionally keeps no
// plugin-owned state: Mattermost remains the source of truth for file metadata
// and permissions.
type Plugin struct {
	plugin.MattermostPlugin

	router *mux.Router
}

// OnActivate initializes the plugin HTTP router.
func (p *Plugin) OnActivate() error {
	p.router = p.initRouter()
	return nil
}

// OnDeactivate has no cleanup because the plugin owns no persistent state or
// background workers.
func (p *Plugin) OnDeactivate() error {
	return nil
}

// ServeHTTP is the entry point for requests to the plugin route.
func (p *Plugin) ServeHTTP(_ *plugin.Context, w http.ResponseWriter, r *http.Request) {
	if p.router == nil {
		p.router = p.initRouter()
	}
	p.router.ServeHTTP(w, r)
}
