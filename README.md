# Image SVG Studio

Image SVG Studio é um editor desktop open source para importar imagens, detectar e recortar objetos, refinar máscaras e exportar PNG/SVG com um fluxo visual inspirado em editores gráficos.

## Recursos

- Importação de PNG, JPG, WebP e BMP
- Detecção automática de objetos
- Recortes manuais e máscaras editáveis
- Editor de camadas com pincel, borracha, restauração, movimentação e ordenação
- Exportação fiel em SVG e vetorização opcional em paths
- Cópia de PNG/SVG para a área de transferência
- Verificação automática de atualizações no GitHub
- Changelog da release exibido dentro do aplicativo
- Build Windows automatizado com GitHub Actions
- Suporte a assinatura Authenticode com Microsoft Artifact Signing

## Atualizações

Ao abrir o aplicativo, o Image SVG Studio consulta a release mais recente publicada no GitHub. Também é possível abrir **Configurações** e clicar em **Verificar atualização**. Quando existe uma versão nova, o aplicativo mostra as notas da release e permite abrir a página oficial do GitHub para fazer o download.

## Desenvolvimento

Requisitos principais:

- Go 1.24+
- Node.js 22+
- Wails v2.10.2

Para desenvolvimento no Windows, use `dev.bat`. Para gerar o executável localmente, use `build.bat`.

## Releases

O workflow `.github/workflows/release.yml` gera o executável Windows x64, um ZIP e o SHA-256. Cada nova versão definida em `version/version.go` pode produzir uma GitHub Release com notas automáticas.

Arquivos publicados:

- `ImageSVGStudio-<version>-windows-amd64.exe`
- `ImageSVGStudio-<version>-windows-amd64.zip`
- `ImageSVGStudio-<version>-windows-amd64.sha256`

## Assinatura do executável

O workflow está preparado para usar **Microsoft Artifact Signing** antes de publicar uma release. Quando a assinatura estiver configurada, o `.exe` é assinado, validado com `Get-AuthenticodeSignature` e só então publicado no GitHub Releases.

Para habilitar a assinatura, configure no repositório GitHub:

### Secrets

- `AZURE_CLIENT_ID`
- `AZURE_TENANT_ID`
- `AZURE_SUBSCRIPTION_ID`

### Variables

- `ARTIFACT_SIGNING_ENDPOINT`
- `ARTIFACT_SIGNING_ACCOUNT`
- `ARTIFACT_SIGNING_PROFILE`

A autenticação do workflow usa **OpenID Connect (OIDC)** através de `azure/login`, portanto a App Registration/Managed Identity usada no Azure deve ter uma **Federated Credential** para este repositório e permissão para assinar usando o perfil escolhido.

A identidade também precisa da role **Artifact Signing Certificate Profile Signer** no recurso/perfil utilizado.

Se essas configurações não estiverem completas, o workflow continua gerando o build como artifact interno do GitHub Actions, mas **não publica nem sobrescreve uma GitHub Release com executável não assinado**.

## Licença

Distribuído sob a licença MIT. Consulte `LICENSE`.
