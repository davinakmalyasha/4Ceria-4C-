Payment Receipt — 4Ceria Portal
===============================

Your payment has been verified and recorded.

Project : {{ $project->title }}
Item    : {{ $label }}
Amount  : {{ $formattedAmount }}
Type    : {{ ucfirst(str_replace('_', ' ', $paymentType)) }}
Date    : {{ now()->timezone('Asia/Jakarta')->format('d M Y, H:i') }} WIB

The assigned professional has been notified that the payment cleared
and the related work is unlocked.

You can review the full payment ledger on your project dashboard:
{{ config('app.env') === 'production' ? 'https://4ceria.com' : url('/') }}/dashboard

This is an automated receipt — no reply needed.
