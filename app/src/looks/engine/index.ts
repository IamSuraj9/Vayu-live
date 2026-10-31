import * as DATA from "./data"

export { Scene } from "./scene"

/** Load the detailed map, build the land mask and take the current wind field. Safe to call again for a new field. */
export async function prepare() { await DATA.init(); return DATA.setField() }
export const refreshField = DATA.setField
