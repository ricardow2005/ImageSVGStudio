package app

import (
	"context"
	"encoding/base64"
	"encoding/json"
	"fmt"
	"mime"
	"net/http"
	"os"
	"path/filepath"
	"regexp"
	"strconv"
	"strings"
	"time"

	wruntime "github.com/wailsapp/wails/v2/pkg/runtime"
	"image-svg-studio/version"
)

const (
	latestReleaseAPI = "https://api.github.com/repos/ricardow2005/ImageSVGStudio/releases/latest"
	releasesPageURL  = "https://github.com/ricardow2005/ImageSVGStudio/releases"
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

type UpdateInfo struct {
	CurrentVersion  string `json:"currentVersion"`
	LatestVersion   string `json:"latestVersion"`
	UpdateAvailable bool   `json:"updateAvailable"`
	ReleaseName     string `json:"releaseName"`
	ReleaseURL      string `json:"releaseUrl"`
	PublishedAt     string `json:"publishedAt"`
	Changelog       string `json:"changelog"`
}

type githubRelease struct {
	TagName     string    `json:"tag_name"`
	Name        string    `json:"name"`
	HTMLURL     string    `json:"html_url"`
	Body        string    `json:"body"`
	PublishedAt time.Time `json:"published_at"`
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

func (a *App) CheckForUpdates() (UpdateInfo, error) {
	client := &http.Client{
		Timeout: 10 * time.Second,
	}

	request, err := http.NewRequestWithContext(a.ctx, http.MethodGet, latestReleaseAPI, nil)
	if err != nil {
		return UpdateInfo{}, fmt.Errorf("preparar verificação de atualização: %w", err)
	}

	request.Header.Set("Accept", "application/vnd.github+json")
	request.Header.Set("User-Agent", "ImageSVGStudio/"+version.Version)
	request.Header.Set("X-GitHub-Api-Version", "2022-11-28")

	response, err := client.Do(request)
	if err != nil {
		return UpdateInfo{}, fmt.Errorf("não foi possível consultar o GitHub: %w", err)
	}
	defer response.Body.Close()

	if response.StatusCode < http.StatusOK || response.StatusCode >= http.StatusMultipleChoices {
		return UpdateInfo{}, fmt.Errorf("GitHub respondeu com status %d", response.StatusCode)
	}

	var release githubRelease
	if err := json.NewDecoder(response.Body).Decode(&release); err != nil {
		return UpdateInfo{}, fmt.Errorf("ler informações da atualização: %w", err)
	}

	latestVersion := normalizeVersion(release.TagName)
	if latestVersion == "" {
		return UpdateInfo{}, fmt.Errorf("a release mais recente não possui uma tag de versão válida")
	}

	releaseURL := strings.TrimSpace(release.HTMLURL)
	if releaseURL == "" {
		releaseURL = releasesPageURL
	}

	changelog := strings.TrimSpace(release.Body)
	if changelog == "" {
		changelog = "O GitHub não publicou notas detalhadas para esta versão. Abra a página da release para ver os commits e arquivos disponíveis."
	}

	return UpdateInfo{
		CurrentVersion:  version.Version,
		LatestVersion:   latestVersion,
		UpdateAvailable: compareVersions(latestVersion, version.Version) > 0,
		ReleaseName:     strings.TrimSpace(release.Name),
		ReleaseURL:      releaseURL,
		PublishedAt:     release.PublishedAt.Format(time.RFC3339),
		Changelog:       changelog,
	}, nil
}

func (a *App) OpenReleasePage(releaseURL string) error {
	releaseURL = strings.TrimSpace(releaseURL)
	if releaseURL == "" {
		releaseURL = releasesPageURL
	}

	if !strings.HasPrefix(releaseURL, releasesPageURL) {
		return fmt.Errorf("URL de release inválida")
	}

	wruntime.BrowserOpenURL(a.ctx, releaseURL)
	return nil
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

func normalizeVersion(value string) string {
	value = strings.TrimSpace(value)
	value = strings.TrimPrefix(strings.ToLower(value), "v")
	return strings.TrimSpace(value)
}

func compareVersions(left string, right string) int {
	left = normalizeVersion(left)
	right = normalizeVersion(right)

	leftCore := strings.SplitN(left, "-", 2)[0]
	rightCore := strings.SplitN(right, "-", 2)[0]
	leftParts := strings.Split(leftCore, ".")
	rightParts := strings.Split(rightCore, ".")

	partCount := len(leftParts)
	if len(rightParts) > partCount {
		partCount = len(rightParts)
	}

	for index := 0; index < partCount; index++ {
		leftPart := 0
		rightPart := 0
		if index < len(leftParts) {
			leftPart, _ = strconv.Atoi(leftParts[index])
		}
		if index < len(rightParts) {
			rightPart, _ = strconv.Atoi(rightParts[index])
		}

		if leftPart > rightPart {
			return 1
		}
		if leftPart < rightPart {
			return -1
		}
	}

	leftPrerelease := strings.Contains(left, "-")
	rightPrerelease := strings.Contains(right, "-")
	if leftPrerelease && !rightPrerelease {
		return -1
	}
	if !leftPrerelease && rightPrerelease {
		return 1
	}
	return 0
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
