package main

import (
	"github.com/mattermost/mattermost/server/public/plugin"
)

var clientMain = plugin.ClientMain

func main() {
	clientMain(&Plugin{})
}
