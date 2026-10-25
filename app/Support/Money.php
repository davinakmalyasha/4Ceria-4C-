<?php

namespace App\Support;

use InvalidArgumentException;
use JsonSerializable;
use Stringable;

/**
 * An immutable monetary amount held in integer minor units (sen for IDR).
 *
 * WHY THIS EXISTS
 * ---------------
 * Every money path in this repository used to be PHP `float`, against columns
 * declared `decimal(24,2)`. A `decimal(24,2)` column can hold values up to
 * ~1.7e22; a PHP double tops out at ~9e15 AND carries only 15-17 significant
 * decimal digits. So a Rp 1e12 project at sen precision sits right at the
 * double's exact-integer limit, and the schema was quietly lying about what the
 * code could represent.
 *
 * The specific failure that motivated this: refund caps compared
 * `net-of-refunds` against `gross-refunded`, and every tolerance in the escrow
 * was a magic `+ 0.01` epsilon on a float. None of those comparisons are
 * reproducible at the values real projects reach.
 *
 * Integer minor units is the same approach Stripe, Shopify and Laravel Cashier
 * take. It is exact, it is testable, and it makes the money arithmetic in this
 * codebase a pure function of integers.
 *
 * WHY STORAGE STAYS decimal(24,2)
 * -------------------------------
 * The value object converts at the model-cast boundary. The column keeps its
 * declared precision, which means:
 *   - existing rows need no rewrite,
 *   - a non-IDR currency (a Phase 6 gateway concern) is a `currency` column
 *     away, not a data migration,
 *   - and anyone reading the database in a SQL client sees human-readable
 *     numbers rather than integer sen.
 *
 * INVARIANTS
 * ----------
 *   - `minor` is always an integer, never a float.
 *   - `currency` is always a 3-letter uppercase code.
 *   - Arithmetic between different currencies throws. There is no implicit FX.
 *   - `allocate()` distributes by largest remainder, so N parts always sum
 *     exactly to the whole — no lost or invented sen. This is what replaces the
 *     `Math.round(pct / 100 * total)` pattern that currently exists in both the
 *     SPA and `ProjectController::signContract`.
 */
final class Money implements JsonSerializable, Stringable
{
    public const SCALE = 2;

    /** Number of minor units per major unit, by currency. */
    private const SCALES = [
        // Currencies where the "decimal" part is not in use. Expressed in
        // minor units anyway so the arithmetic stays uniform.
        'IDR' => 2,
        'USD' => 2,
        'EUR' => 2,
        'SGD' => 2,
        'MYR' => 2,
        'AUD' => 2,
        'JPY' => 0,
        'KRW' => 0,
        'VND' => 0,
    ];

    private function __construct(
        private readonly int $minor,
        private readonly string $currency,
    ) {
    }

    // -----------------------------------------------------------------
    // Construction
    // -----------------------------------------------------------------

    /**
     * Build from any common representation.
     *
     * Accepts an integer count of MINOR units, or a major-unit value as int,
     * float or decimal string. `'15000000'`, `15000000`, `15000000.50` and
     * `'15000000.50'` all mean Rp 15,000,000.50.
     *
     * Floats are accepted but rounded to the currency's scale, because a
     * float cannot be trusted beyond ~15 significant digits. Callers that have
     * an exact decimal should pass it as a string.
     */
    public static function of(int|float|string $amount, string $currency = 'IDR'): self
    {
        $currency = strtoupper(trim($currency));
        $scale = self::scaleFor($currency);

        if (is_int($amount)) {
            return new self($amount * (10 ** $scale), $currency);
        }

        $normalised = self::normaliseDecimal((string) $amount, $scale);

        return new self((int) $normalised, $currency);
    }

    /**
     * Build from an integer count of minor units, with no interpretation.
     *
     * Use when the value came from a database column that is already in minor
     * units, or from `toInt()`.
     */
    public static function ofMinor(int $minor, string $currency = 'IDR'): self
    {
        return new self($minor, strtoupper(trim($currency)));
    }

    public static function zero(string $currency = 'IDR'): self
    {
        return new self(0, strtoupper(trim($currency)));
    }

    /**
     * Read a value straight off a decimal column, which Laravel returns as a
     * string when cast with `decimal:2` and as a string when read raw.
     *
     * Handles the shapes that actually appear in this schema: a numeric
     * string, a PHP float, an int, and — for legacy rows — an empty string or
     * null, which must become zero rather than blowing up a money path.
     */
    public static function fromColumn(mixed $value, string $currency = 'IDR'): self
    {
        if ($value instanceof self) {
            return $value;
        }

        if ($value === null || $value === '') {
            return self::zero($currency);
        }

        return self::of($value, $currency);
    }

    /**
     * Split an amount across weights without losing or inventing a single sen.
     *
     * Plain proportional division loses money: 100 sen across 3 equal parts is
     * 33.33 each, which sums to 99.99. This distributes the remainder one minor
     * unit at a time, in descending weight order, so the parts always sum
     * exactly to the original.
     *
     * Used for termin schedules, where `ProjectController::signContract` and the
     * SPA both currently compute `Math.round(pct / 100 * total)` independently
     * and therefore disagree.
     *
     * @param  array<string|int, int>  $weights
     * @return array<string|int, self>
     */
    public function allocate(array $weights): array
    {
        if ($weights === []) {
            throw new InvalidArgumentException('Money::allocate() requires at least one weight.');
        }

        $total = array_sum($weights);

        if ($total <= 0) {
            throw new InvalidArgumentException('Money::allocate() requires the weights to sum to a positive number.');
        }

        // Exact integer shares first, remainder accumulated for distribution.
        $shares = [];
        $remainders = [];
        $assigned = 0;

        foreach ($weights as $key => $weight) {
            $exactNumerator = $this->minor * $weight;
            $share = intdiv($exactNumerator, $total);
            $shares[$key] = $share;
            $remainders[$key] = $exactNumerator - ($share * $total);
            $assigned += $share;
        }

        $left = $this->minor - $assigned;

        if ($left !== 0) {
            $direction = $left > 0 ? 1 : -1;
            $count = abs($left);

            // Hand out the leftover one unit at a time. Positive leftover goes
            // to the LARGEST remainder first (those parts were rounded down
            // hardest); a negative leftover — a refund being split — is taken
            // back from the SMALLEST remainder first, so the rounding error is
            // unwound where it was introduced.
            //
            // Ties break on the key so the result never depends on the order
            // the caller happened to pass the weights in.
            if ($direction > 0) {
                uksort(
                    $remainders,
                    static fn ($a, $b) => $remainders[$b] <=> $remainders[$a] ?: strcmp((string) $a, (string) $b)
                );
            } else {
                uksort(
                    $remainders,
                    static fn ($a, $b) => $remainders[$a] <=> $remainders[$b] ?: strcmp((string) $a, (string) $b)
                );
            }

            $keys = array_keys($remainders);

            // `%` keeps the dividend's sign in PHP, so an explicit wrap keeps
            // the index in range even when the leftover exceeds the key count.
            for ($i = 0; $i < $count; $i++) {
                $shares[$keys[$i % count($keys)]] += $direction;
            }
        }

        return array_map(fn (int $minor) => new self($minor, $this->currency), $shares);
    }

    /**
     * Split into N equal parts, distributing the remainder.
     *
     * @return array<int, self>
     */
    public function split(int $parts): array
    {
        if ($parts < 1) {
            throw new InvalidArgumentException('Money::split() requires at least one part.');
        }

        return $this->allocate(array_fill(0, $parts, 1));
    }

    /**
     * A percentage of this amount, rounded HALF AWAY FROM ZERO.
     *
     * The rounding is explicit rather than inherited from float behaviour, and
     * it is applied to the SIGNED product -- not to a magnitude with a sign
     * reapplied afterwards.
     *
     * WHY HALF AWAY FROM ZERO, AND WHY THAT MATTERS FOR NEGATIVES
     * -----------------------------------------------------------
     * This used to be:
     *
     *     intdiv($this->minor * $basisPoints + 5000, 10000)
     *
     * which is correct for positive amounts and biased for negative ones.
     * `intdiv()` truncates TOWARD ZERO, so the `+ 5000` half-up offset only ever
     * pushes the result up. On a negative amount it pushes a rounding decision
     * in the wrong direction, and can round the WRONG WAY entirely once the
     * product is small enough that the offset dominates:
     *
     *     -1000 minor x 50 bp = -50000; (-50000 + 5000) / 10000 = 0 (truncated)
     *     expected -5, returned 0
     *
     * So `-1.00` at 5% gave `0` instead of `-0.05`. Refunds, reversals and
     * negative adjustments are all real money movements in this codebase, and
     * `Money` is the single source of truth for all of them.
     *
     * The sign is applied after rounding the magnitude, which makes the
     * behaviour symmetric: percentage() is odd about the origin, so
     * `(-x)->percentage(p) === -(x->percentage(p))` for every p.
     */
    public function percentage(string|int|float $percentage): self
    {
        $basisPoints = self::toBasisPoints($percentage);

        // THE OVERFLOW, AND HOW IT IS AVOIDED.
        //
        // The obvious implementation — `$this->minor * $basisPoints` — overflows
        // a 64-bit integer once the amount passes about Rp 9.2 trillion, and
        // PHP's integer overflow BECOMES A FLOAT. `intdiv(float, int)` then
        // threw a TypeError from deep inside an escrow path:
        //
        //     intdiv(): Argument #1 ($num1) must be of type int, float given
        //
        // So the legacy application CRASHED on a percentage of an amount that
        // large, and the Go port — which computes the product in 128 bits —
        // returns the right answer. A crash is bad; two engines disagreeing is
        // worse, because the Go port is the one that will replace this.
        //
        // The multiplication is therefore DECOMPOSED, so the intermediate never
        // overflows:
        //
        //     magnitude = q * 10000 + r
        //     magnitude * bp / 10000
        //         = q * bp  +  r * bp / 10000
        //
        // `q * bp` fits whenever the RESULT fits and the percentage is at most
        // 100 %, and `r * bp` is bounded by 10 000 * 10^8. The rounding is
        // applied to the fractional remainder, which is the same half-away-from-
        // zero rule as before.
        $magnitude = abs($this->minor);
        $basisPointsMagnitude = abs($basisPoints);

        // BOTH signs are applied at the END, and the decomposition works on
        // MAGNITUDES only.
        //
        // With a negative basis point count the intermediate remainder goes
        // negative, and PHP's `%` keeps the dividend's sign — so
        // `intdiv(-58 568 108, 10 000)` is -5856 and the remainder is -8108,
        // which is a DIFFERENT decomposition than the positive one and lands
        // a sen away. The rounding rule is "half away from zero on the
        // magnitude", so the magnitude is what gets decomposed.
        $sign = ($this->minor < 0 ? -1 : 1) * ($basisPoints < 0 ? -1 : 1);

        $quotient = intdiv($magnitude, 10000);
        $remainderAmount = $magnitude % 10000;

        $whole = $quotient * $basisPointsMagnitude;

        if (! is_int($whole)) {
            throw new InvalidArgumentException(
                "A percentage of {$this->toDecimal()} overflows the 64-bit minor-unit range. "
                .'The amount is larger than the escrow can represent exactly, so the result '
                .'cannot be computed without losing money. Split the amount instead.'
            );
        }

        // `r * bp` is bounded by 10 000 * 10^8 = 10^12, so it never overflows.
        $scaledRemainder = $remainderAmount * $basisPointsMagnitude;
        $carry = intdiv($scaledRemainder, 10000);
        $fraction = $scaledRemainder % 10000;

        $result = $whole + $carry;

        if (! is_int($result)) {
            throw new InvalidArgumentException(
                "A percentage of {$this->toDecimal()} overflows the 64-bit minor-unit range. "
                .'The amount is larger than the escrow can represent exactly, so the result '
                .'cannot be computed without losing money. Split the amount instead.'
            );
        }

        // Round the magnitude half away from zero, then restore the sign.
        if ($fraction >= 5000) {
            $result += 1;
        }

        return new self($sign * $result, $this->currency);
    }

    // -----------------------------------------------------------------
    // Arithmetic
    // -----------------------------------------------------------------

    public function add(self $other): self
    {
        $this->assertSameCurrency($other);

        return new self($this->minor + $other->minor, $this->currency);
    }

    public function subtract(self $other): self
    {
        $this->assertSameCurrency($other);

        return new self($this->minor - $other->minor, $this->currency);
    }

    /** Negate, for representing an outbound movement. */
    public function negate(): self
    {
        return new self(-$this->minor, $this->currency);
    }

    public function abs(): self
    {
        return new self(abs($this->minor), $this->currency);
    }

    /**
     * Multiply by a scalar.
     *
     * A non-integer factor is rounded half-up to the nearest minor unit, which
     * is the only defensible reading — and it is done once, here, rather than
     * implicitly at every call site.
     */
    public function multiplyBy(int|float $factor): self
    {
        // THE PRECISION LIMIT.
        //
        // `$this->minor * $factor` is evaluated as a float, and a float64
        // carries only 15-16 significant digits. Above 2^53 — about Rp 90
        // trillion — the product silently loses its low bits, so the RESULT IS
        // A DIFFERENT NUMBER. `round()` then rounds the wrong quantity,
        // faithfully.
        //
        // The Go port computes the product in 128 bits and refuses when the
        // result is out of range, so the two engines would disagree. Below the
        // threshold nothing changes, and the differential corpus proves it.
        //
        // A WHOLE factor is multiplied EXACTLY, in integers, so the only limit
        // is the int64 range of the PRODUCT — which PHP detects for us, because
        // an overflowing integer multiplication becomes a float.
        if (is_int($factor) || (is_float($factor) && floor($factor) === $factor)) {
            $exact = $this->minor * (int) $factor;

            if (is_int($exact)) {
                return new self($exact, $this->currency);
            }

            throw new InvalidArgumentException(
                "Multiplying {$this->toDecimal()} by {$factor} overflows the 64-bit minor-unit "
                .'range, so the result cannot be represented exactly. The amount is larger than '
                .'the escrow can represent; split it instead.'
            );
        }

        // A FRACTIONAL factor has to go through a float, and a float is only
        // exact while the PRODUCT fits in 53 bits — the input alone is not
        // enough, because multiplying by 1.05 already pushes it past.
        if (abs($this->minor) * abs($factor) > 9007199254740992) {
            throw new InvalidArgumentException(
                "Multiplying {$this->toDecimal()} by {$factor} exceeds the precision of a "
                .'64-bit minor-unit amount, so the result would not be exact. The amount is '
                .'larger than the escrow can represent; split it instead.'
            );
        }

        return new self((int) round($this->minor * $factor), $this->currency);
    }

    /**
     * Divide by an exact divisor. Throws on zero rather than producing an
     * infinity the ledger would then try to store.
     */
    public function divideBy(int $divisor): self
    {
        if ($divisor === 0) {
            throw new InvalidArgumentException('Money cannot be divided by zero.');
        }

        return new self(intdiv($this->minor, $divisor), $this->currency);
    }

    // -----------------------------------------------------------------
    // Comparison
    // -----------------------------------------------------------------

    /** @return int -1, 0 or 1 */
    public function compare(self $other): int
    {
        $this->assertSameCurrency($other);

        return $this->minor <=> $other->minor;
    }

    public function equals(self $other): bool
    {
        return $this->compare($other) === 0;
    }

    public function isGreaterThan(self $other): bool
    {
        return $this->compare($other) > 0;
    }

    public function isGreaterThanOrEqual(self $other): bool
    {
        return $this->compare($other) >= 0;
    }

    public function isLessThan(self $other): bool
    {
        return $this->compare($other) < 0;
    }

    public function isLessThanOrEqual(self $other): bool
    {
        return $this->compare($other) <= 0;
    }

    public function isZero(): bool
    {
        return $this->minor === 0;
    }

    public function isPositive(): bool
    {
        return $this->minor > 0;
    }

    public function isNegative(): bool
    {
        return $this->minor < 0;
    }

    // -----------------------------------------------------------------
    // Accessors
    // -----------------------------------------------------------------

    /** Integer count of minor units. */
    public function toInt(): int
    {
        return $this->minor;
    }

    /** Fixed-point decimal string, e.g. "15000000.50". */
    public function toDecimal(): string
    {
        $scale = $this->scale();

        if ($scale === 0) {
            return (string) $this->minor;
        }

        $divisor = 10 ** $scale;
        $sign = $this->minor < 0 ? '-' : '';
        $abs = abs($this->minor);

        return $sign
            . intdiv($abs, $divisor)
            . '.'
            . str_pad((string) ($abs % $divisor), $scale, '0', STR_PAD_LEFT);
    }

    /**
     * Float, for presentation only.
     *
     * Never feed the result back into arithmetic — that is the whole problem
     * this class exists to remove. JSON responses use `toDecimal()` via
     * `jsonSerialize()`.
     */
    public function toFloat(): float
    {
        return (float) $this->toDecimal();
    }

    public function getCurrency(): string
    {
        return $this->currency;
    }

    public function withCurrency(string $currency): self
    {
        // No conversion happens here. Re-expressing an amount in another
        // currency requires a rate, and inventing one silently would be worse
        // than refusing.
        $currency = strtoupper(trim($currency));

        if ($currency === $this->currency) {
            return $this;
        }

        throw new InvalidArgumentException(
            "Refusing to reinterpret {$this->currency} {$this->toDecimal()} as {$currency}. "
            .'Convert explicitly with a rate you have actually been given.'
        );
    }

    public function __toString(): string
    {
        return $this->toDecimal();
    }

    /**
     * JSON representation.
     *
     * A decimal STRING, not a float — a JSON float would reintroduce the
     * precision loss on the client side, which is exactly the bug that made the
     * SPA's escrow display wrong. The currency rides along so a client never
     * has to guess.
     */
    public function jsonSerialize(): array
    {
        return [
            'amount' => $this->toDecimal(),
            'currency' => $this->currency,
        ];
    }

    // -----------------------------------------------------------------
    // Internals
    // -----------------------------------------------------------------

    private function scale(): int
    {
        return self::SCALES[$this->currency] ?? self::SCALE;
    }

    private static function scaleFor(string $currency): int
    {
        return self::SCALES[$currency] ?? self::SCALE;
    }

    /**
     * Convert a decimal string to a scaled integer, WITHOUT going through
     * float.
     *
     * A float cannot represent 0.1 exactly, so `(int) round(0.1 * 100)` is
     * right only by luck. String manipulation is the only exact path.
     *
     * DELIBERATELY STRICT. Only a canonical `[-]digits[.digits]` is accepted.
     * A parser that guesses whether `1,500` means fifteen hundred or one and a
     * half, or whether `1.500.000,50` is Indonesian or German formatting, is a
     * parser that will eventually guess wrong inside an escrow ledger. Localised
     * input belongs at the edge of the system, converted once, by a caller that
     * knows where it came from — not inferred here.
     *
     * Spaces (including NBSP and narrow NBSP, which browsers emit for
     * thousands grouping) and underscores ARE tolerated, because they are
     * unambiguous: they never appear in a canonical decimal.
     */
    private static function normaliseDecimal(string $amount, int $scale): string
    {
        $amount = trim($amount);

        if ($amount === '') {
            return '0';
        }

        $amount = str_replace(["\u{00A0}", "\u{202F}", '_', ' '], '', $amount);

        if (! preg_match('/^([+-]?)(\d+)(?:\.(\d*))?$/', $amount, $m)) {
            throw new InvalidArgumentException(
                "\"{$amount}\" is not a valid monetary amount. Expected a canonical decimal such as "
                .'"15000000.50" — a thousands separator or a locale-specific decimal mark is rejected '
                .'on purpose, because guessing which is which can silently move the wrong amount.'
            );
        }

        $sign = $m[1] === '-' ? '-' : '';
        $whole = $m[2];
        $fraction = $m[3] ?? '';

        if ($scale === 0) {
            return $sign . $whole;
        }

        // Truncate anything beyond the currency's precision rather than
        // silently rounding a value the caller may reconcile against a bank.
        $fraction = substr(str_pad($fraction, $scale, '0', STR_PAD_RIGHT), 0, $scale);

        return $sign . ($whole . $fraction);
    }

    /**
     * Convert a percentage into integer basis points, so 11% is 1100.
     *
     * Refuses a percentage that cannot be represented, rather than truncating
     * 11.999% to something that silently under-taxes.
     */
    private static function toBasisPoints(string|int|float $percentage): int
    {
        if (is_int($percentage)) {
            return $percentage * 100;
        }

        $normalised = (string) $percentage;

        if (str_contains($normalised, ',')) {
            $normalised = str_replace(',', '.', $normalised);
        }

        if (! preg_match('/^([+-]?)(\d*)(?:\.(\d*))?$/', trim($normalised), $m)) {
            throw new InvalidArgumentException("\"{$percentage}\" is not a valid percentage.");
        }

        $whole = $m[2] === '' ? '0' : $m[2];
        $fraction = str_pad($m[3] ?? '', 2, '0', STR_PAD_RIGHT);
        $fraction = substr($fraction, 0, 2);

        $value = ((int) $whole * 100) + (int) $fraction;

        return ($m[1] === '-' ? -$value : $value);
    }

    private function assertSameCurrency(self $other): void
    {
        if ($other->currency !== $this->currency) {
            throw new InvalidArgumentException(
                "Cannot combine {$this->currency} {$this->toDecimal()} with "
                ."{$other->currency} {$other->toDecimal()}: no exchange rate is in scope."
            );
        }
    }
}
