const PITCH = 'Set on the fractured crust of Oakhaven, eight rival orders wage tactical proxy wars with minted brass-and-bone plates to claim the last working Manifolds.'

export const SHELL_HEADERS = {
  'content-type': 'text/html; charset=utf-8',
  'cache-control': 'no-store',
  'x-content-type-options': 'nosniff',
  'x-frame-options': 'DENY',
  'referrer-policy': 'no-referrer',
  'content-security-policy': "default-src 'none'; script-src 'self'; connect-src 'self' ws: wss:"
} as const

export const SCRIPT_HEADERS = {
  'content-type': 'text/javascript; charset=utf-8',
  'cache-control': 'no-store',
  'x-content-type-options': 'nosniff'
} as const

export function renderShell(): string {
  return [
    '<!doctype html>',
    '<html lang="en">',
    '<head>',
    '<meta charset="utf-8">',
    '<meta name="viewport" content="width=device-width, initial-scale=1">',
    '<title>Aetherbound: Shattered Concord</title>',
    `<meta name="description" content="${PITCH}">`,
    '</head>',
    '<body>',
    '<canvas id="stage"></canvas>',
    '<script type="module" src="/client.js"></script>',
    '</body>',
    '</html>',
    ''
  ].join('\n')
}