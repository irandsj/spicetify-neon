# Como instalar o NeonDrift

[English](INSTALL.md)

O NeonDrift tem duas partes. Instale só a extensão, ou a extensão e o tema.

- **NeonDrift Ambient** (extensão): `extension/neondrift-ambient.js`
- **NeonDrift** (tema): a pasta `theme/NeonDrift` (`user.css` + `color.ini`)

Precisa do Spotify para computador com o [Spicetify](https://spicetify.app) **2.x** instalado
(`spicetify -v` mostra a versão).

### Como ter o Spicetify 2

O Spicetify 3 ainda não carrega temas e extensões do Spicetify 2, então nenhuma parte do NeonDrift apareceria nele.
O instalador do Spicetify sempre instala a versão mais nova, a não ser que você diga qual quer; então peça a última
versão 2.x:

- Windows (PowerShell):
  ```powershell
  $v="2.45.3"; iwr -useb https://raw.githubusercontent.com/spicetify/cli/main/install.ps1 | iex
  ```
- Linux / macOS:
  ```sh
  curl -fsSL https://raw.githubusercontent.com/spicetify/cli/main/install.sh | sh -s -- 2.45.3
  ```

Não rode `spicetify upgrade` enquanto quiser continuar com o NeonDrift: ele passa para o Spicetify mais novo (o 3.x,
quando ele virar a versão principal). `spicetify config check_spicetify_update 0` desliga o lembrete.

Pasta do Spicetify: `%appdata%\spicetify` no Windows, `~/.config/spicetify` no Linux e no macOS
(`spicetify path userdata` mostra onde fica).

## Pelo Marketplace

Depois que o NeonDrift for publicado: Marketplace do Spicetify > procure **NeonDrift**.

- O cartão do tema **NeonDrift** instala o tema e já carrega a extensão junto.
- O cartão **NeonDrift Ambient** instala só a extensão (para usar com qualquer outro tema).

Pode instalar os dois: só uma cópia da extensão roda.

## Na mão

### A extensão

1. Copie `neondrift-ambient.js` para a pasta `Extensions` do Spicetify.
2. Rode:
   ```sh
   spicetify config extensions neondrift-ambient.js
   spicetify apply
   ```

### O tema

1. Copie a pasta `theme/NeonDrift` para a pasta `Themes` do Spicetify, ficando `Themes/NeonDrift/user.css` e
   `Themes/NeonDrift/color.ini`.
2. Rode:
   ```sh
   spicetify config current_theme NeonDrift color_scheme Neon
   spicetify apply
   ```

O tema funciona com `replace_colors` 0 ou 1 (o padrão do Spicetify é 1).

### Vindo de um NeonDrift antigo, com `theme.js`

As versões antigas do NeonDrift traziam o modo ambiente num `theme.js` dentro da pasta do tema. Apague esse arquivo
(e a pasta `assets` antiga do tema) e desligue o script do tema, senão duas cópias carregam:

```sh
spicetify config inject_theme_js 0
spicetify apply
```

Os seus ajustes continuam como estão (mesmo lugar, mesmo formato).

## Atualizar

Copie os arquivos novos por cima dos antigos e rode `spicetify apply`. Pelo Marketplace, atualiza sozinho.

## Desinstalar

### Tirar a extensão

```sh
spicetify config extensions neondrift-ambient.js-
spicetify apply
```

### Tirar o tema (só se o NeonDrift for o seu tema atual)

Isto deixa o Spicetify sem tema nenhum; pule esta parte se você usa a extensão com outro tema.

```sh
spicetify config current_theme ""
spicetify apply
```

Depois apague os arquivos que você copiou.

### Apagar os ajustes guardados

Os ajustes e a imagem escolhida ficam no armazenamento local do Spotify até você apagar. Para apagar, abra o
console do DevTools (`spicetify enable-devtools`, depois Ctrl+Shift+I no Spotify) e rode:

```js
localStorage.removeItem("NeonDrift:ambient:v2");
localStorage.removeItem("NeonDrift:ambient-mode");
localStorage.removeItem("NeonDrift:lang");
localStorage.removeItem("NeonDrift:compat-note");
localStorage.removeItem("NeonDrift:intro-seen");
indexedDB.deleteDatabase("NeonDrift");
```

## Opções para os curiosos

- `localStorage.setItem("NeonDrift:lang", "en")` (ou `"pt-BR"`) força um idioma; apague a chave para voltar a
  seguir o Spotify. Recarregue o Spotify (Ctrl+R com o DevTools ligado, ou feche e abra) para ver.
- `localStorage.setItem("NeonDrift:debug", "1")` mostra no console o que a extensão faz.
- `NeonDriftAmbient.state()`, `.compat()` e `.theme()` no console contam o que ela está vendo.
