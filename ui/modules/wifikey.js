import { createLaunchModule } from "./_launch.js";

const mod = createLaunchModule({
  id: "wifikey",
  title: "WifiKey",
  blurb: "Profils et clés Wi-Fi",
});

export const mount = mod.mount;
