/**
 * Builds the exact <script> tag public/widget-loader.js expects (see its
 * own doc comment). The loader resolves its own origin from
 * document.currentScript.src, so this only ever needs the current app
 * origin -- no NEXT_PUBLIC_APP_URL or other env var involved.
 */
export function buildWidgetSnippet(widgetKey: string, origin: string): string {
  return `<script src="${origin}/widget-loader.js" data-widget-key="${widgetKey}"></script>`;
}
