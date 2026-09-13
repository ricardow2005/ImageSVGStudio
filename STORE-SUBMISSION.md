# Publicar o Image SVG Studio na Microsoft Store

Este projeto gera um pacote MSIX próprio para envio à Microsoft Store. O pacote da Store é separado do `.exe` publicado diretamente no GitHub.

## 1. Criar a conta de desenvolvedor

Acesse:

- https://storedeveloper.microsoft.com/
- https://partner.microsoft.com/dashboard

Entre com sua conta Microsoft e conclua o cadastro do Windows Developer Program.

## 2. Reservar o nome do aplicativo

No Partner Center:

1. Abra **Apps and games**.
2. Clique em **New product**.
3. Escolha **MSIX or PWA app**.
4. Procure por `Image SVG Studio`.
5. Se estiver disponível, clique em **Reserve product name**.

## 3. Copiar a identidade oficial da Store

Depois de reservar o produto:

1. Abra o produto no Partner Center.
2. Expanda **Product management**.
3. Abra **Product identity**.
4. Copie exatamente estes três valores:

- `Package/Identity/Name`
- `Package/Identity/Publisher`
- `Package/Properties/PublisherDisplayName`

Esses valores são sensíveis a maiúsculas/minúsculas e precisam bater exatamente com o manifest do MSIX.

## 4. Configurar o GitHub Actions

No GitHub, abra:

**Repository > Settings > Secrets and variables > Actions > Variables**

Crie estas três Repository Variables:

| Variable | Valor |
| --- | --- |
| `STORE_PACKAGE_NAME` | valor de `Package/Identity/Name` |
| `STORE_PUBLISHER` | valor de `Package/Identity/Publisher` |
| `STORE_PUBLISHER_DISPLAY_NAME` | valor de `Package/Properties/PublisherDisplayName` |

Esses dados não são senhas, então podem ser configurados como Variables em vez de Secrets.

## 5. Gerar o MSIX

Abra a aba **Actions** no GitHub e execute o workflow **Windows Build, Store MSIX & Release**.

O job cria um artifact chamado:

`ImageSVGStudio-<version>-MicrosoftStore-MSIX`

Baixe esse artifact. Dentro dele haverá:

- `ImageSVGStudio-<version>-store-x64.msix`
- `ImageSVGStudio-<version>-store-x64.sha256`
- `STORE-IDENTITY.txt`

Abra o `STORE-IDENTITY.txt` e confirme que aparece:

`Store identity configured: true`

Se aparecer `false`, não envie o pacote para a Store. Isso significa que o build usou uma identidade placeholder de desenvolvimento.

## 6. Criar a submissão no Partner Center

No produto reservado:

1. Crie uma nova submission.
2. Preencha **Pricing and availability**.
3. Preencha **Properties**.
4. Preencha **Age ratings**.
5. Em **Packages**, envie o arquivo `.msix` gerado pelo GitHub Actions.
6. Preencha a **Store listing**, incluindo descrição, screenshots e logo.
7. Revise **Submission options**.
8. Envie para certificação.

## 7. Assinatura

Para submissões MSIX, o pacote não precisa usar um certificado Code Signing comprado por você. Depois que a aplicação passa pela certificação, a Microsoft Store assina/reassina o pacote com um certificado da Microsoft.

Isso significa que o aplicativo instalado pela Microsoft Store não depende do certificado usado para o `.exe` direto do GitHub.

## 8. Downloads diretos do GitHub

O `.exe` direto continua sendo um canal separado. Caso você queira mantê-lo publicamente disponível sem alertas de editor desconhecido, ele ainda precisa de Authenticode/Code Signing próprio.

Se você quiser evitar esse custo, pode usar a Microsoft Store como canal recomendado de instalação do Image SVG Studio e manter o GitHub principalmente para código-fonte, issues e releases técnicas.

## 9. Atualizações futuras

Para cada atualização enviada à Store:

1. aumente `version/version.go`;
2. gere um novo MSIX pelo GitHub Actions;
3. crie uma nova submission no mesmo produto do Partner Center;
4. envie o novo `.msix`.

A identidade (`Name`, `Publisher` e `PublisherDisplayName`) deve continuar sendo a mesma em todas as versões do aplicativo.
