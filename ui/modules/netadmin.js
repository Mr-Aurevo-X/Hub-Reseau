import { createLaunchModule } from "./_launch.js";

const mod = createLaunchModule({
  id: "netadmin",
  title: "NetAdmin",
  blurb: "Adaptateurs, hosts, firewall",
});

export const mount = mod.mount;
