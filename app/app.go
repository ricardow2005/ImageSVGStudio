package app

import (
	"context"
	"encoding/base64"
	"fmt"
	"mime"
	"os"
	"path/filepath"
	"regexp"
	"strings"

	wruntime "github.com/wailsapp/wails/v2/pkg/runtime"
	"image-svg-studio/version"
)

type App struct {
	ctx context.Context
}

type ImagePayload struct {
	Name     string `json:"name"`
	Path     string `json:"path"`
	MimeType string `json:"mimeType"`
	DataURL  string `json:"dataUrl"`
}

type SVGFile struct {
	Name    string `json:"name"`
	Content string `json:"content"`
}

type AppInfo struct {
	Version   string `json:"version"`
	Commit    string `json:"commit"`
	BuildDate string `json:"buildDate"`
}

func New() *App {
	return &App{}
}

func (a *App) Startup(ctx context.Context) {
	a.ctx = ctx
}

func (a *App) DomReady(ctx context.Context) {
	a.ctx = ctx
	if !wruntime.WindowIsMaximised(ctx) {
		wruntime.WindowMaximise(ctx)
	}
}

func (a *App) Info() AppInfo {
	return AppInfo{
		Version:   version.Version,
		Commit:    version.Commit,
		BuildDate: version.BuildDate,
	}
}

func (a *App) PickImage() (ImagePayload, error) {
	path, err := wruntime.OpenFileDialog(a.ctx, wruntime.OpenDialogOptions{
		Title: "Importar imagem",
		Filters: []wruntime.FileFilter{
			{
				DisplayName: "Imagens",
				Pattern:     "*.png;*.jpg;*.jpeg;*.webp;*.bmp",
			},
		},
	})
	if err != nil {
		return ImagePayload{}, err
	}
	if strings.TrimSpace(path) == "" {
		return ImagePayload{}, nil
	}

	data, err := os.ReadFile(path)
	if err != nil {
		return ImagePayload{}, fmt.Errorf("ler imagem: %w", err)
	}

	mimeType := mime.TypeByExtension(strings.ToLower(filepath.Ext(path)))
	if mimeType == "" {
		mimeType = "image/png"
	}

	return ImagePayload{
		Name:     filepath.Base(path),
		Path:     path,
		MimeType: mimeType,
		DataURL:  "data:" + mimeType + ";base64," + base64.StdEncoding.EncodeToString(data),
	}, nil
}

func (a *App) SaveSVG(defaultName string, content string) (string, error) {
	defaultName = ensureSVGName(defaultName)
	path, err := wruntime.SaveFileDialog(a.ctx, wruntime.SaveDialogOptions{
		Title:           "Salvar SVG",
		DefaultFilename: defaultName,
		Filters: []wruntime.FileFilter{
			{
				DisplayName: "SVG",
				Pattern:     "*.svg",
			},
		},
	})
	if err != nil {
		return "", err
	}
	if strings.TrimSpace(path) == "" {
		return "", nil
	}

	if err := os.WriteFile(path, []byte(content), 0o644); err != nil {
		return "", fmt.Errorf("salvar SVG: %w", err)
	}
	return path, nil
}

func (a *App) SaveSVGSet(files []SVGFile) (string, error) {
	if len(files) == 0 {
		return "", fmt.Errorf("nenhum SVG para exportar")
	}

	directory, err := wruntime.OpenDirectoryDialog(a.ctx, wruntime.OpenDialogOptions{
		Title: "Escolha a pasta para exportar os SVGs",
	})
	if err != nil {
		return "", err
	}
	if strings.TrimSpace(directory) == "" {
		return "", nil
	}

	for index, file := range files {
		name := strings.TrimSpace(file.Name)
		if name == "" {
			name = fmt.Sprintf("objeto-%02d.svg", index+1)
		}
		name = ensureSVGName(safeFilename(name))
		path := filepath.Join(directory, name)
		if err := os.WriteFile(path, []byte(file.Content), 0o644); err != nil {
			return "", fmt.Errorf("salvar %s: %w", name, err)
		}
	}

	return directory, nil
}

func (a *App) Minimise() {
	wruntime.WindowMinimise(a.ctx)
}

func (a *App) ToggleMaximise() {
	if wruntime.WindowIsMaximised(a.ctx) {
		wruntime.WindowUnmaximise(a.ctx)
		return
	}
	wruntime.WindowMaximise(a.ctx)
}

func (a *App) Close() {
	wruntime.Quit(a.ctx)
}

func ensureSVGName(name string) string {
	name = strings.TrimSpace(name)
	if name == "" {
		name = "imagem-extraida.svg"
	}
	if !strings.EqualFold(filepath.Ext(name), ".svg") {
		name += ".svg"
	}
	return name
}

var invalidFilename = regexp.MustCompile(`[<>:"/\\|?*\x00-\x1F]+`)

func safeFilename(name string) string {
	name = invalidFilename.ReplaceAllString(name, "-")
	name = strings.Trim(name, " .-")
	if name == "" {
		return "objeto.svg"
	}
	return name
}
