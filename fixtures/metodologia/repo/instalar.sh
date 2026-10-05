#!/bin/bash
# Instala la metodología en ~/.claude (o en $HOME, para pruebas con HOME=$(mktemp -d)).
# Uso: [TABLERO_DIR=/ruta/al/tablero] ./instalar.sh [--dry-run] [--plugins]
#   --dry-run  solo muestra lo que haría, no toca nada
#   --plugins  además añade el marketplace oficial y habilita los plugins recomendados
# Nunca pisa tu settings.json: lo fusiona (tus valores ganan; los hooks se suman).
set -euo pipefail

DRY=0; PLUGINS=0
for a in "$@"; do
  case "$a" in
    --dry-run) DRY=1 ;;
    --plugins) PLUGINS=1 ;;
    -h|--help) sed -n '2,6p' "$0"; exit 0 ;;
    *) echo "Opción desconocida: $a" >&2; exit 2 ;;
  esac
done

REPO="$(cd "$(dirname "$0")" && pwd)"
CLAUDE_DIR="$HOME/.claude"
FECHA="$(date +%Y%m%d-%H%M%S)"
RESP="$CLAUDE_DIR/backups/$FECHA"
SETTINGS="$CLAUDE_DIR/settings.json"
PLUGINS_REPO=(token-weather guardia-produccion guardia-ramas estado-trabajo servidores-locales panel-tablero)
# El tablero vive fuera del repo; ~/.claude/tablero es la ruta única que usan hooks y skills.
TABLERO_DIR="${TABLERO_DIR:-$REPO/../metodologia-claude/tablero}"

hacer() { # ejecuta o solo imprime
  if [ "$DRY" = 1 ]; then echo "  [dry-run] $*"; else "$@"; fi
}
paso() { echo; echo "▸ $*"; }

paso "1. Comprobando requisitos"
faltan=0
for c in jq node claude; do
  if command -v "$c" >/dev/null 2>&1; then echo "  ✓ $c"; else echo "  ✗ falta $c"; faltan=1; fi
done
[ "$faltan" = 0 ] || { echo "Instala lo que falta y reintenta." >&2; exit 1; }

paso "2. Respaldo en $RESP"
hacer mkdir -p "$RESP"
for f in CLAUDE.md settings.json statusline.sh agents metodologia hooks; do
  if [ -e "$CLAUDE_DIR/$f" ] || [ -L "$CLAUDE_DIR/$f" ]; then
    hacer cp -a "$CLAUDE_DIR/$f" "$RESP/"
    echo "  respaldado: $f"
  fi
done

paso "3. Enlaces simbólicos"
hacer mkdir -p "$CLAUDE_DIR/agents"
hacer ln -sfn "$REPO/claude/CLAUDE.md" "$CLAUDE_DIR/CLAUDE.md"
hacer ln -sfn "$REPO/claude/statusline.sh" "$CLAUDE_DIR/statusline.sh"
hacer ln -sfn "$REPO/claude/agents/buscador.md" "$CLAUDE_DIR/agents/buscador.md"
hacer mkdir -p "$CLAUDE_DIR/skills"
# Una carpeta real (no enlace) haría que ln creara el enlace dentro de ella: se respalda y se quita.
if [ -d "$CLAUDE_DIR/skills/relevo" ] && [ ! -L "$CLAUDE_DIR/skills/relevo" ]; then
  hacer mkdir -p "$RESP/skills" && hacer mv "$CLAUDE_DIR/skills/relevo" "$RESP/skills/"
fi
hacer ln -sfn "$REPO/claude/skills/relevo" "$CLAUDE_DIR/skills/relevo"
# METODOLOGIA_DIR por defecto: ~/.claude/metodologia -> metodologia/ del repo
hacer ln -sfn "$REPO/metodologia" "$CLAUDE_DIR/metodologia"
# Hooks globales en ~/.claude/hooks (ruta única para settings.json)
hacer mkdir -p "$CLAUDE_DIR/hooks"
hacer ln -sfn "$REPO/claude/hooks/acotar_lectura.mjs" "$CLAUDE_DIR/hooks/acotar_lectura.mjs"
hacer ln -sfn "$REPO/metodologia/vigilar_contexto.sh" "$CLAUDE_DIR/hooks/vigilar_contexto.sh"
# Tablero: ~/.claude/tablero -> TABLERO_DIR (si no existe, los hooks que lo usan se saltan solos)
if [ -d "$TABLERO_DIR" ]; then
  hacer ln -sfn "$(cd "$TABLERO_DIR" && pwd)" "$CLAUDE_DIR/tablero"
else
  echo "  (sin tablero en $TABLERO_DIR: define TABLERO_DIR y reinstala para activar el tablero)"
fi

paso "4. Fusión de settings.json"
dirs=""
for p in "${PLUGINS_REPO[@]}"; do dirs="${dirs:+$dirs:}$REPO/plugins/$p"; done
[ "$PLUGINS" = 1 ] || base_filtro='del(.enabledPlugins, .extraKnownMarketplaces)'
base_filtro="${base_filtro:-.}"
existente='{}'; [ -f "$SETTINGS" ] && existente="$(cat "$SETTINGS")"
nuevo="$(jq -n --argjson ex "$existente" --slurpfile base "$REPO/claude/settings.base.json" --arg dirs "$dirs" "
  (\$base[0] | $base_filtro) as \$b |
  # Fusión profunda: los valores de la persona ganan; los hooks se suman sin duplicar.
  def fusion(\$a; \$b):
    if (\$a|type) == \"object\" and (\$b|type) == \"object\"
    then reduce ((\$a|keys) + (\$b|keys) | unique[]) as \$k ({}; .[\$k] = (if (\$a|has(\$k)) and (\$b|has(\$k)) then fusion(\$a[\$k]; \$b[\$k]) elif (\$a|has(\$k)) then \$a[\$k] else \$b[\$k] end))
    else \$b end;
  fusion(\$b; \$ex)
  | .hooks = (reduce ((\$b.hooks // {}) | keys[]) as \$ev (.hooks // {};
      .[\$ev] = ((((\$b.hooks[\$ev]) // []) + ((\$ex.hooks[\$ev]) // [])) | unique_by(.hooks | map(.command))) ))
  | .env.CLAUDE_CODE_PLUGIN_DIRS = (
      ([(\$ex.env.CLAUDE_CODE_PLUGIN_DIRS // \"\") | split(\":\")[] | select(. != \"\" and (contains(\"/metodologia-claude-code/plugins/\") | not) )]
       + (\$dirs | split(\":\"))) | join(\":\"))
")"
if [ "$DRY" = 1 ]; then
  echo "  [dry-run] settings.json resultante (diff contra el actual):"
  diff <(printf '%s\n' "$existente" | jq -S .) <(printf '%s\n' "$nuevo" | jq -S .) | sed 's/^/    /' || true
else
  printf '%s\n' "$nuevo" | jq . > "$SETTINGS.nuevo" && mv "$SETTINGS.nuevo" "$SETTINGS"
  echo "  settings.json actualizado"
fi

paso "5. Bitácora"
if [ -f "$REPO/metodologia/BITACORA.md" ]; then
  echo "  ya existe, no se toca"
else
  hacer cp "$REPO/metodologia/BITACORA.plantilla.md" "$REPO/metodologia/BITACORA.md"
fi

if [ "$PLUGINS" = 1 ]; then
  paso "6. Plugins oficiales recomendados"
  for p in typescript-lsp session-report; do
    hacer claude plugin install "$p@claude-plugins-official" || echo "  (no se pudo instalar $p; hazlo a mano)"
  done
else
  paso "6. Plugins oficiales: omitido (usa --plugins para instalarlos)"
fi

echo
if [ "$DRY" = 1 ]; then echo "Dry-run terminado: no se cambió nada."; else
  echo "Listo. Abre una sesión NUEVA de claude (los plugins y el env solo se leen al arrancar)."
  echo "Respaldo: $RESP — para revertir: ./desinstalar.sh"
fi
