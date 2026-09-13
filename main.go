package main

import (
	"embed"
	"fmt"
	"io/fs"
	"os"

	"github.com/wailsapp/wails/v2"
	"github.com/wailsapp/wails/v2/pkg/options"
	"github.com/wailsapp/wails/v2/pkg/options/assetserver"
	"github.com/wailsapp/wails/v2/pkg/options/windows"
	"image-svg-studio/app"
)

//go:embed all:frontend/dist
var assets embed.FS

func main() {
	frontend, err := fs.Sub(assets, "frontend/dist")
	if err != nil {
		panic(err)
	}

	application := app.New()

	err = wails.Run(&options.App{
		Title:            "Image SVG Studio",
		Width:            1280,
		Height:           800,
		MinWidth:         1050,
		MinHeight:        680,
		WindowStartState: options.Maximised,
		Frameless:        true,
		BackgroundColour: &options.RGBA{R: 12, G: 15, B: 23, A: 1},
		AssetServer: &assetserver.Options{
			Assets: frontend,
		},
		OnStartup:  application.Startup,
		OnDomReady: application.DomReady,
		Bind: []interface{}{
			application,
		},
		Windows: &windows.Options{
			WebviewIsTransparent: false,
			WindowIsTranslucent:  false,
			Theme:                windows.Dark,
		},
	})
	if err != nil {
		fmt.Fprintln(os.Stderr, "Image SVG Studio:", err)
		os.Exit(1)
	}
}
