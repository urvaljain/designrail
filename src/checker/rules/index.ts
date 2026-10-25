import type { Rule } from "../types.js";
import { dr001 } from "./dr001-colors.js";
import { dr002 } from "./dr002-spacing.js";
import { dr003 } from "./dr003-fonts.js";
import { dr004 } from "./dr004-raw-elements.js";
import { dr005 } from "./dr005-inline-styles.js";
import { dr006 } from "./dr006-image-alt.js";
import { dr007 } from "./dr007-form-labels.js";
import { dr008 } from "./dr008-component-imports.js";

/** Rules in evaluation order. DR005 runs after DR001-DR003 so it can skip values they already reported. */
export const RULES: readonly Rule[] = [dr001, dr002, dr003, dr004, dr005, dr006, dr007, dr008];
