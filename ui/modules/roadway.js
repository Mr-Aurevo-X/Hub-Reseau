import { createLaunchModule } from "./_launch.js";

const mod = createLaunchModule({
  id: "roadway",
  title: "RoadWay-X",
  blurb: "Trafic live NIC / alertes",
});

export const mount = mod.mount;
