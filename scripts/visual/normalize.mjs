/**
 * The NORMALISERS — the rules that decide whether two computed styles are the
 * same picture.
 *
 * WHY THEY EXIST
 * --------------
 * A computed style is not a picture. Two styles that paint the same pixels can
 * differ in their text, because the browser and the two CSS engines serialise
 * the same thing differently:
 *
 *   - v3 emitted `--tw-*` shadow variables and composed `box-shadow` from
 *     three shadows; v4 composes it from five, two of them transparent. The
 *     LISTS differ; the rendering does not.
 *   - v3 wrote `transform: rotate(6deg)`; v4 writes `rotate: 6deg` as its own
 *     property. The strings differ; the rendering does not.
 *   - v3's `outline-none` was `outline: 2px solid transparent`; v4's is
 *     `outline-style: none`. Both paint nothing.
 *   - `rgb(255, 255, 255 / 0.3)` and `rgb(255,255,255/0.3)` are the same
 *     colour.
 *   - `0px` and `0rem` are the same length.
 *
 * These are shared by the capture (which hashes the NORMALISED style into the
 * committed baseline) and by the comparison (which reports the differences).
 * One implementation, so the baseline and the report can never disagree.
 */

/** A length, normalised to pixels. */
export const normaliseLength = (value) => {
    if (typeof value !== 'string') return value;

    const match = value.match(/^(-?[\d.]+)(px|rem|em|%)?$/);
    if (!match) return value;

    const amount = Number(match[1]);
    const unit = match[2] ?? 'px';

    if (unit === 'rem' || unit === 'em') return `${amount * 16}px`;

    return `${amount}${unit}`;
};

/**
 * A box-shadow LIST.
 *
 * A shadow with zero blur, zero spread and zero offset has no extent, so it
 * paints nothing whatever its colour. Tailwind v3 emitted one of those as the
 * ring-offset shadow (`rgb(255, 255, 255) 0px 0px 0px 0px`) and v4 emits the
 * ring shadows as transparent. Neither paints.
 */
export const paintsNothing = (shadow) =>
    /,\s*0px\s+0px\s+0px\s*$/.test(shadow) || /\s0px\s+0px\s+0px$/.test(shadow);

export const normaliseBoxShadow = (value) => {
    if (typeof value !== 'string' || value === 'none') return value;

    return value
        .split(/,(?![^(]*\))/)
        .map((part) => part.trim())
        .filter((part) => !paintsNothing(part))
        .join(', ');
};

/** A colour: the same colour, a different serialisation. */
export const normaliseColour = (value) =>
    typeof value === 'string'
        ? value.replace(/\s*,\s*/g, ',').replace(/\s*\/\s*/g, '/')
        : value;

/**
 * An alpha value, rounded to two decimals.
 *
 * Chromium quantises an alpha to 8 bits, and it does so in the colour's own
 * space: `rgb(255 255 255 / 0.3)` reports `0.3020` in sRGB and `0.2980` in
 * oklab. The two are the same colour, one 1/255 apart.
 */
export const normaliseAlpha = (value) => {
    if (typeof value !== 'string') return value;

    return value.replace(/\/\s*0\.\d{3,}/g, (match) => {
        const alpha = Number(match.replace('/', ''));
        return `/${alpha.toFixed(2)}`;
    });
};

/**
 * A border radius.
 *
 * `rounded-full` is `9999px` in v3 and `calc(infinity * 1px)` in v4, which
 * Chromium reports as `3.35544e+07px`. Both clamp to half the box, so both
 * render a pill.
 */
export const normaliseRadius = (value) => {
    if (typeof value !== 'string') return value;

    const match = value.match(/^(-?[\d.]+(?:e[+-]?\d+)?)px$/);
    if (!match) return value;

    const amount = Number(match[1]);
    if (amount >= 9999) return 'clamped';

    return value;
};

/**
 * A TRANSFORM.
 *
 * v3 wrote `transform: rotate(6deg)`; v4 writes `rotate: 6deg` as its own
 * property and composes it. The strings differ; the rendering does not — and
 * the RENDERED GEOMETRY (the bounding box, captured as `__box`) is what proves
 * it.
 *
 * So the whole group normalises to ONE constant and the box carries the
 * evidence. Normalising `none` differently from a value would re-introduce
 * exactly the false positive this exists to remove.
 */
export const normaliseTransform = () => 'transform';

/**
 * A PROPERTY LIST, compared as a set.
 *
 * The two autoprefixers add different vendor prefixes to the same list, and
 * Chromium reports the prefixed form as an extra entry.
 */
export const normalisePropertyList = (value) => {
    if (typeof value !== 'string') return value;

    return [
        ...new Set(value.split(',').map((v) => v.trim().replace(/-webkit-/g, ''))),
    ]
        .sort()
        .join(',');
};

/**
 * The properties that are compared through the RENDERED GEOMETRY rather than
 * through their own value.
 */
export const GEOMETRY_PROPERTIES = new Set([
    'transform',
    'transform-origin',
    'translate',
    'rotate',
    'scale',
]);

/** The properties whose lengths are normalised to pixels. */
export const LENGTH_PROPERTIES = new Set([
    'padding-top', 'padding-right', 'padding-bottom', 'padding-left',
    'margin-top', 'margin-right', 'margin-bottom', 'margin-left',
    'width', 'height', 'min-width', 'min-height', 'max-width', 'max-height',
    'top', 'right', 'bottom', 'left',
    'gap', 'row-gap', 'column-gap',
    'font-size', 'letter-spacing', 'line-height', 'word-spacing', 'text-indent',
    'border-top-width', 'border-right-width', 'border-bottom-width', 'border-left-width',
    'outline-width', 'outline-offset',
    'border-top-left-radius', 'border-top-right-radius',
    'border-bottom-right-radius', 'border-bottom-left-radius',
    'stroke-width', 'flex-basis', 'flex-grow', 'flex-shrink', 'order', 'z-index',
]);

/**
 * Normalise ONE property value.
 *
 * Returns the normalised value; the caller compares the two.
 */
export const normaliseProperty = (property, value, sibling = {}) => {
    // The OUTLINE check comes FIRST. `outline-width` and `outline-offset` are
    // lengths, and the length branch below would return them as-is before the
    // visibility check ever ran — which is exactly the difference between v3's
    // `outline: 2px solid transparent` and v4's `outline-style: none`.
    if (property.startsWith('outline-')) {
        // An outline is VISIBLE or it is not. v3's `outline-none` was
        // `outline: 2px solid transparent` and v4's is `outline-style: none`.
        // Both paint nothing.
        const style = sibling['outline-style'];
        const colour = sibling['outline-color'];

        const invisible = (s, c) => s === 'none' || c === 'transparent';

        if (invisible(style, colour)) return 'invisible';

        return value;
    }

    if (GEOMETRY_PROPERTIES.has(property)) {
        return normaliseTransform(value);
    }

    if (LENGTH_PROPERTIES.has(property)) {
        const normalised = normaliseLength(value);

        if (property.endsWith('-radius')) {
            return normaliseRadius(normalised);
        }

        return normalised;
    }

    if (property === 'box-shadow') {
        return normaliseBoxShadow(value);
    }

    if (property === 'transition-property') {
        return normalisePropertyList(value);
    }

    if (property === 'color' || property.endsWith('-color') || property === 'background-color') {
        return normaliseAlpha(normaliseColour(value));
    }

    return value;
};
