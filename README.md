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
- Geração automática de pacote MSIX para Microsoft Store
- Suporte opcional a assinatura Authenticode para downloads diretos do GitHub

## Atualizações

Ao abrir o aplicativo, o Image SVG Studio consulta a release mais recente publicada no GitHub. Também é possível abrir **Configurações** e clicar em **Verificar atualização**. Quando existe uma versão nova, o aplicativo mostra as notas da release e permite abrir a página oficial do GitHub para fazer o download.

## Desenvolvimento

Requisitos principais:

- Go 1.24+
- Node.js 22+
- Wails v2.10.2

Para desenvolvimento no Windows, use `dev.bat`. Para gerar o executável localmente, use `build.bat`.

## Microsoft Store / MSIX

O workflow `.github/workflows/release.yml` agora gera um artifact separado chamado:

`ImageSVGStudio-<version>-MicrosoftStore-MSIX`

Ele contém:

- `ImageSVGStudio-<version>-store-x64.msix`
- `ImageSVGStudio-<version>-store-x64.sha256`
- `STORE-IDENTITY.txt`

A Microsoft Store assina/reassina pacotes MSIX depois da certificação, portanto **não é necessário comprar um certificado de Code Signing para o pacote enviado à Store**.

Antes de enviar o pacote ao Partner Center, reserve o produto **Image SVG Studio** e copie os três valores exatos em **Product management > Product identity**:

- `Package/Identity/Name`
- `Package/Identity/Publisher`
- `Package/Properties/PublisherDisplayName`

Depois configure esses valores no GitHub em **Settings > Secrets and variables > Actions > Variables**:

- `STORE_PACKAGE_NAME`
- `STORE_PUBLISHER`
- `STORE_PUBLISHER_DISPLAY_NAME`

Rode novamente o workflow. Quando os três valores estiverem configurados, o MSIX gerado terá a identidade correta para upload no Partner Center.

Se essas variáveis ainda não existirem, o workflow gera um **MSIX de preview** com identidade placeholder apenas para validar o pipeline. Esse pacote não deve ser enviado para a Store.

Veja o passo a passo completo em [`STORE-SUBMISSION.md`](STORE-SUBMISSION.md).

## Releases diretas do GitHub

O workflow também gera o executável Windows x64, ZIP e SHA-256 como artifacts internos:

- `ImageSVGStudio-<version>-windows-amd64.exe`
- `ImageSVGStudio-<version>-windows-amd64.zip`
- `ImageSVGStudio-<version>-windows-amd64.sha256`

A publicação pública desses arquivos no GitHub Releases continua condicionada a uma assinatura Authenticode válida. Isso é separado do fluxo da Microsoft Store.

## Assinatura opcional do executável direto

Para downloads diretos do GitHub, o workflow continua preparado para usar Microsoft Artifact Signing quando disponível.

### Secrets

- `AZURE_CLIENT_ID`
- `AZURE_TENANT_ID`
- `AZURE_SUBSCRIPTION_ID`

### Variables

- `ARTIFACT_SIGNING_ENDPOINT`
- `ARTIFACT_SIGNING_ACCOUNT`
- `ARTIFACT_SIGNING_PROFILE`

Se essa configuração não estiver completa, a Release pública com `.exe` é ignorada, mas o **MSIX para Microsoft Store continua sendo gerado normalmente**.

## Licença

Distribuído sob a licença MIT. Consulte `LICENSE`.
