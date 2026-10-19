/** Responsive workspace breakpoints. Keep these aligned with shell-mobile.css and shell-tablet.css.
 * A wider touch viewport is a tablet workspace; phone landscape stays in the mobile layout.
 */
export const NON_DESKTOP_WORKSPACE_MEDIA =
  '(max-width: 939px), (max-width: 1600px) and (pointer: coarse) and (hover: none)'

export const TABLET_WORKSPACE_MEDIA =
  '(min-width: 701px) and (max-width: 1199px) and (min-height: 600px), (min-width: 701px) and (max-width: 1600px) and (min-height: 600px) and (pointer: coarse) and (hover: none)'

export const TABLET_RAIL_MEDIA =
  '(min-width: 1024px) and (max-width: 1600px) and (min-height: 600px) and (orientation: landscape) and (pointer: coarse) and (hover: none)'
