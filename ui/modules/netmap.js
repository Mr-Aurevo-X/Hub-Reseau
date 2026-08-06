import { mountEmbeddedApp } from "./_hub_util.js";

export async function mount(root) {
  await mountEmbeddedApp(root, {
    ns: 'netmap',
    src: './embedded/netmap/index.html',
    title: 'NetMap',
    subtitle: 'Connexions · ports · proxy',
    segments: null,
  });
}
