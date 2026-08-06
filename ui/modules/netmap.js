import { createLaunchModule } from "./_launch.js";

const mod = createLaunchModule({
  id: "netmap",
  title: "NetMap",
  blurb: "Connexions TCP/UDP ↔ PID",
});

export const mount = mod.mount;
