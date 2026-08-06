import { mountEmbeddedApp } from "./_hub_util.js";

export async function mount(root) {
  await mountEmbeddedApp(root, {
    ns: 'netadmin',
    src: './embedded/netadmin/index.html',
    title: 'NetAdmin',
    subtitle: 'Adaptateurs · Hosts · Pare-feu',
    segments: null,
  });
}
