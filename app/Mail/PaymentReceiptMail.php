<?php

namespace App\Mail;

use App\Models\Project;
use Illuminate\Bus\Queueable;
use Illuminate\Contracts\Queue\ShouldQueue;
use Illuminate\Mail\Mailable;
use Illuminate\Mail\Mailables\Content;
use Illuminate\Mail\Mailables\Envelope;
use Illuminate\Queue\SerializesModels;

/**
 * Payment receipt — the first transactional email on the money flow.
 * Sent (queued) whenever a payment proof is verified so the payer has
 * written evidence of every released milestone/termin payment.
 */
class PaymentReceiptMail extends Mailable implements ShouldQueue
{
    use Queueable, SerializesModels;

    public function __construct(
        public Project $project,
        public string $label,
        public string $formattedAmount,
        public string $paymentType,
    ) {}

    public function envelope(): Envelope
    {
        return new Envelope(
            subject: "Payment Receipt — {$this->label} ({$this->project->title})",
        );
    }

    public function content(): Content
    {
        return new Content(
            text: 'mail.payment-receipt',
        );
    }
}
