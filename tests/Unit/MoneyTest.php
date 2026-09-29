<?php

use App\Support\Money;

/*
|--------------------------------------------------------------------------
| Money value object
|--------------------------------------------------------------------------
|
| PURE UNIT TEST. No Laravel, no database — `tests/Unit` deliberately uses the
| default PHPUnit binding, because this class has no dependencies and proving
| that is part of the test.
|
| This is the foundation the rest of the money layer is being moved onto, so
| the cases that matter are the ones where float arithmetic silently loses
| money: allocation remainders, exact decimal parsing, and comparison at
| magnitudes that overflow a double.
*/

// ---------------------------------------------------------------------------
// Construction
// ---------------------------------------------------------------------------

it('constructs from a decimal string without going through a float', function () {
    // 0.1 is not representable in binary floating point. String parsing is
    // the only exact path, and this is the assertion that proves it is used.
    expect(Money::of('0.10')->toInt())->toBe(10)
        ->and(Money::of('0.1')->toInt())->toBe(10)
        ->and(Money::of('15000000.50')->toInt())->toBe(1_500_000_050);
});

it('constructs from int, float and string identically', function () {
    // Rp 1,500,000.50 == 1,500,000 major x 100 + 50 sen == 150,000,050 minor.
    $expected = 150_000_050;

    expect(Money::of(1_500_000.50)->toInt())->toBe($expected)
        ->and(Money::of('1500000.50')->toInt())->toBe($expected)
        ->and(Money::of(1_500_000.5)->toInt())->toBe($expected)
        ->and(Money::of('1500000.5')->toInt())->toBe($expected);
});

it('treats a bare integer as major units, not minor units', function () {
    // This is the ambiguity that makes a money API dangerous. `of()` means
    // major units, always. `ofMinor()` is the explicit escape hatch.
    expect(Money::of(1000)->toInt())->toBe(100_000)
        ->and(Money::ofMinor(1000)->toInt())->toBe(1000);
});

it('rejects a value it cannot parse rather than coercing it to zero', function () {
    Money::of('not money');
})->throws(InvalidArgumentException::class);

it('tolerates unambiguous grouping characters', function () {
    // Spaces and underscores never appear in a canonical decimal, so stripping
    // them cannot change the value.
    expect(Money::of('1 500 000.50')->toInt())->toBe(150_000_050)
        ->and(Money::of("1\u{00A0}500\u{00A0}000.50")->toInt())->toBe(150_000_050)
        ->and(Money::of('1_500_000.50')->toInt())->toBe(150_000_050);
});

it('rejects ambiguous separators rather than guessing which is which', function () {
    // `1,500` is fifteen hundred in one convention and one-and-a-half in
    // another. A parser that guesses will eventually guess wrong inside an
    // escrow ledger, so it refuses. Localised input is converted at the edge of
    // the system, by a caller that knows where it came from.
    Money::of('1,500');
})->throws(InvalidArgumentException::class);

it('rejects a locale-specific decimal mark', function () {
    Money::of('15000000,50');
})->throws(InvalidArgumentException::class);

it('rejects a malformed decimal rather than coercing it to zero', function () {
    foreach (['abc', '1.2.3', '..', '5%', '1e5', '--3'] as $bad) {
        expect(fn () => Money::of($bad))->toThrow(InvalidArgumentException::class);
    }
});

it('reads a database column safely, including null and empty string', function () {
    // A legacy row with a null amount must read as zero, not blow up a money
    // path — under shouldBeStrict a missing attribute is already fatal, and
    // this must not be a second, quieter way to fail.
    expect(Money::fromColumn(null)->toInt())->toBe(0)
        ->and(Money::fromColumn('')->toInt())->toBe(0)
        ->and(Money::fromColumn('2500.00')->toInt())->toBe(250_000)
        ->and(Money::fromColumn(2500.00)->toInt())->toBe(250_000)
        ->and(Money::fromColumn(Money::of('7.77'))->toDecimal())->toBe('7.77');
});

it('normalises the currency code', function () {
    expect(Money::of(1, 'idr')->getCurrency())->toBe('IDR')
        ->and(Money::of(1, ' idr ')->getCurrency())->toBe('IDR');
});

// ---------------------------------------------------------------------------
// Arithmetic
// ---------------------------------------------------------------------------

it('adds and subtracts exactly at magnitudes that overflow a double', function () {
    // Rp 9,876,543,210,987.65 — well past the point where accumulating in
    // float stops being exact. As minor units this is 987_654_321_098_765,
    // which is inside a 64-bit integer, so the arithmetic is exact.
    $big = Money::of('9876543210987.65');
    $small = Money::of('0.01');

    expect($big->toInt())->toBe(987_654_321_098_765)
        ->and($big->subtract($small)->toDecimal())->toBe('9876543210987.64')
        ->and($big->add($big)->toDecimal())->toBe('19753086421975.30');
});

it('never loses a sen across a thousand additions', function () {
    $total = Money::zero();
    $cent = Money::of('0.01');

    for ($i = 0; $i < 1000; $i++) {
        $total = $total->add($cent);
    }

    // The float equivalent of this loop drifts; the integer one cannot.
    expect($total->toInt())->toBe(1000)
        ->and($total->toDecimal())->toBe('10.00');
});

it('handles negatives for the refund direction', function () {
    $refund = Money::of('4000000.00')->negate();

    expect($refund->isNegative())->toBeTrue()
        ->and($refund->toDecimal())->toBe('-4000000.00')
        ->and($refund->abs()->toDecimal())->toBe('4000000.00');
});

it('round-trips through its decimal string', function () {
    foreach (['0.00', '0.01', '1.00', '999.99', '15000000.50', '9876543210987.65'] as $value) {
        expect(Money::of($value)->toDecimal())->toBe($value);
    }
});

it('truncates beyond the currency precision instead of silently rounding', function () {
    // 0.005 in IDR has no representation. Rounding it up would create money
    // the counterparty never sent; truncating is the conservative error and it
    // is a deliberate, documented choice rather than float behaviour.
    expect(Money::of('1.005')->toDecimal())->toBe('1.00');
});

it('refuses to divide by zero instead of producing infinity', function () {
    Money::of('100')->divideBy(0);
})->throws(InvalidArgumentException::class);

it('refuses to combine two currencies because no rate is in scope', function () {
    Money::of('100', 'IDR')->add(Money::of('1', 'USD'));
})->throws(InvalidArgumentException::class);

it('refuses to reinterpret an amount in another currency', function () {
    Money::of('100', 'IDR')->withCurrency('USD');
})->throws(InvalidArgumentException::class);

// ---------------------------------------------------------------------------
// Comparison — this is where the refund bug lived
// ---------------------------------------------------------------------------

it('compares exactly where float comparison is unreliable', function () {
    $a = Money::of('0.30');
    $b = Money::of('0.10')->add(Money::of('0.20'));

    // (float) 0.1 + (float) 0.2 === 0.30000000000000004
    expect(0.1 + 0.2)->not->toBe(0.3);

    expect($a->equals($b))->toBeTrue()
        ->and($a->compare($b))->toBe(0)
        ->and(Money::of('100')->isGreaterThan(Money::of('99.99')))->toBeTrue()
        ->and(Money::of('100')->isLessThanOrEqual(Money::of('100')))->toBeTrue();
});

it('reports sign state', function () {
    expect(Money::zero()->isZero())->toBeTrue()
        ->and(Money::of('0.01')->isPositive())->toBeTrue()
        ->and(Money::of('-0.01')->isNegative())->toBeTrue();
});

// ---------------------------------------------------------------------------
// Allocation — the primitive that fixes the termin split
// ---------------------------------------------------------------------------

it('allocates by weight with no lost or invented sen', function () {
    // 100 sen across 3 equal parts. Naive division gives 33.33 each = 99.99.
    $parts = Money::of('1.00')->split(3);

    expect(array_map(fn (Money $m) => $m->toInt(), $parts))->toBe([34, 33, 33])
        ->and(array_sum(array_map(fn (Money $m) => $m->toInt(), $parts)))->toBe(100);
});

it('allocates by weight and the parts always sum to the whole', function () {
    // The exact case that ProjectController::signContract and the SPA both get
    // wrong today: a 30/30/40 termin split on a contract value that is not
    // divisible by 100. Both compute `Math.round(pct / 100 * total)`
    // independently and therefore disagree.
    $contract = Money::of('10000000.00');
    $parts = $contract->allocate(['dp' => 30, 'mid' => 30, 'final' => 40]);

    expect($parts['dp']->toDecimal())->toBe('3000000.00')
        ->and($parts['dp']->add($parts['mid'])->add($parts['final'])->toDecimal())->toBe('10000000.00')
        ->and($contract->toInt())->toBe(1_000_000_000);
});

it('allocates a sum that naive division cannot produce', function () {
    // Rp 100.00 across 30/30/40 in whole rupiah: naive division yields
    // 30.00 / 30.00 / 40.00 which is fine, but 33/33/34 on Rp 99.99 is not.
    $parts = Money::of('99.99')->allocate(['a' => 33, 'b' => 33, 'c' => 34]);

    $sum = $parts['a']->add($parts['b'])->add($parts['c']);

    expect($sum->toDecimal())->toBe('99.99')
        ->and(array_sum(array_map(fn (Money $m) => $m->toInt(), $parts)))->toBe(9999);
});

it('distributes the remainder to the largest weights first', function () {
    $parts = Money::of('1.00')->allocate(['big' => 50, 'mid' => 30, 'small' => 20]);

    expect($parts['big']->toInt())->toBeGreaterThan($parts['mid']->toInt())
        ->and($parts['mid']->toInt())->toBeGreaterThan($parts['small']->toInt())
        ->and($parts['big']->add($parts['mid'])->add($parts['small'])->toInt())->toBe(100);
});

it('allocates deterministically regardless of key order', function () {
    // Tie-breaking must not depend on insertion order, or the same plan would
    // produce different stage amounts between two requests.
    $a = Money::of('0.03')->allocate(['dp' => 50, 'mid' => 50]);
    $b = Money::of('0.03')->allocate(['mid' => 50, 'dp' => 50]);

    expect($a['dp']->toInt())->toBe($b['dp']->toInt())
        ->and($a['mid']->toInt())->toBe($b['mid']->toInt())
        ->and($a['dp']->add($a['mid'])->toInt())->toBe(3);
});

it('allocates exactly when the division is clean', function () {
    $parts = Money::of('1000.00')->allocate(['dp' => 30, 'final' => 70]);

    expect($parts['dp']->toDecimal())->toBe('300.00')
        ->and($parts['final']->toDecimal())->toBe('700.00');
});

it('handles a negative amount when allocating', function () {
    // A refund splits the same way a payment does.
    $parts = Money::of('-1.00')->split(3);

    expect(array_sum(array_map(fn (Money $m) => $m->toInt(), $parts)))->toBe(-100);
});

it('refuses to allocate over zero or negative weights', function () {
    Money::of('100')->allocate([]);
})->throws(InvalidArgumentException::class);

it('refuses to allocate over a zero weight total', function () {
    Money::of('100')->allocate([0, 0]);
})->throws(InvalidArgumentException::class);

it('refuses to split into fewer than one part', function () {
    Money::of('100')->split(0);
})->throws(InvalidArgumentException::class);

// ---------------------------------------------------------------------------
// Percentages
// ---------------------------------------------------------------------------

it('computes a percentage in integer basis points', function () {
    expect(Money::of('1000000.00')->percentage(11)->toDecimal())->toBe('110000.00')
        ->and(Money::of('1000000.00')->percentage('11.5')->toDecimal())->toBe('115000.00')
        ->and(Money::of('1000000.00')->percentage(0)->toDecimal())->toBe('0.00');
});

it('rounds a percentage half-up at the currency scale', function () {
    // 5% of Rp 0.10 is Rp 0.005, which has no representation. Rounds up to
    // one sen, deterministically, rather than inheriting float behaviour.
    expect(Money::of('0.10')->percentage(5)->toDecimal())->toBe('0.01');
});

it('rejects a percentage it cannot represent', function () {
    Money::of('100')->percentage('eleven');
})->throws(InvalidArgumentException::class);

// ---------------------------------------------------------------------------
// Serialisation
// ---------------------------------------------------------------------------

it('serialises as a decimal string plus currency, never a float', function () {
    // A JSON float would reintroduce the precision loss on the client, which
    // is precisely what made the SPA's escrow readout wrong.
    $json = Money::of('15000000.50')->jsonSerialize();

    expect($json)->toBe(['amount' => '15000000.50', 'currency' => 'IDR'])
        ->and($json['amount'])->toBeString()
        ->and(json_encode(Money::of('0.10')))->toBe('{"amount":"0.10","currency":"IDR"}');
});

it('formats a zero-decimal currency without a fraction', function () {
    // JPY has no minor unit. The same arithmetic still works, it just does not
    // invent sen.
    expect(Money::of('1500', 'JPY')->toDecimal())->toBe('1500')
        ->and(Money::of('1500', 'JPY')->toInt())->toBe(1500);
});

it('is immutable — every operation returns a new instance', function () {
    $a = Money::of('100.00');
    $b = $a->add(Money::of('50.00'));

    expect($a->toDecimal())->toBe('100.00')
        ->and($b->toDecimal())->toBe('150.00')
        ->and($a)->not->toBe($b);
});
