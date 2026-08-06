import { mountEmbeddedApp } from "./_hub_util.js";

export async function mount(root) {
  await mountEmbeddedApp(root, {
    ns: 'wifikey',
    src: './embedded/wifikey/index.html',
    title: 'WifiKey',
    subtitle: 'Profils WLAN',
    segments: null,
  });
}
