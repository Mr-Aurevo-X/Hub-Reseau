import { mountEmbeddedApp } from "./_hub_util.js";

export async function mount(root) {
  await mountEmbeddedApp(root, {
    ns: 'roadway',
    src: './embedded/roadway/index.html',
    title: 'RoadWay-X',
    subtitle: 'Trafic live · flux · alertes',
    segments: null,
  });
}
