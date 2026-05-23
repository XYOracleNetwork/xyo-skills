// Generic deep merge with concat-arrays semantics, tailored to the Template
// composition model used by presets/base.ts.
//
// Rules:
//   array + array        → concat (parent first, child appended), de-duped
//   plain object pair    → recursive key-wise merge
//   anything else        → child wins, unless child is undefined
//
// Array de-dupe uses JSON.stringify for object elements; safe for our shapes
// (TemplateFile etc.) which serialize in stable key order. If a future field
// holds objects with non-deterministic stringification, swap this for a
// structural-equality check.
// Stricter alternative to `Array.isArray` whose built-in narrowing widens to
// `any[]`; the wrapped narrow keeps elements as `unknown`.
function isUnknownArray(value) {
    return Array.isArray(value);
}
function isPlainObject(value) {
    if (value === null || typeof value !== 'object')
        return false;
    const proto = Object.getPrototypeOf(value);
    return proto === Object.prototype || proto === null;
}
function dedupeKey(item) {
    return typeof item === 'object' && item !== null ? JSON.stringify(item) : String(item);
}
export function deepMerge(base, override) {
    if (isUnknownArray(base) && isUnknownArray(override)) {
        const seen = new Set();
        return [...base, ...override].filter((item) => {
            const key = dedupeKey(item);
            if (seen.has(key))
                return false;
            seen.add(key);
            return true;
        });
    }
    if (isPlainObject(base) && isPlainObject(override)) {
        const out = { ...base };
        for (const key of Object.keys(override)) {
            const baseVal = base[key];
            out[key] = baseVal === undefined ? override[key] : deepMerge(baseVal, override[key]);
        }
        return out;
    }
    return override === undefined ? base : override;
}
//# sourceMappingURL=deep-merge.js.map