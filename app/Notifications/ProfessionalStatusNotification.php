<?php

namespace App\Notifications;

use Illuminate\Bus\Queueable;
use Illuminate\Notifications\Messages\MailMessage;
use Illuminate\Notifications\Notification;

class ProfessionalStatusNotification extends Notification
{
    use Queueable;

    protected $status;

    protected $professionalType;

    protected $reason;

    /**
     * Create a new notification instance.
     */
    public function __construct($status, $professionalType, $reason = null)
    {
        $this->status = $status;
        $this->professionalType = $professionalType;
        $this->reason = $reason;
    }

    /**
     * Get the notification's delivery channels.
     *
     * @return array<int, string>
     */
    public function via(object $notifiable): array
    {
        return ['mail', 'database'];
    }

    /**
     * Get the mail representation of the notification.
     */
    public function toMail(object $notifiable): MailMessage
    {
        $statusText = $this->status === 'verified' ? 'Approved' : 'Rejected';
        $color = $this->status === 'verified' ? '#10b981' : '#ef4444';

        $message = (new MailMessage)
            ->subject('Professional Verification Status: '.$statusText)
            ->greeting('Hello, '.$notifiable->name.'!')
            ->line('Your request to join as a '.$this->professionalType.' has been '.$statusText.'.');

        if ($this->status === 'verified') {
            $message->line('Congratulations! You can now start bidding on projects and access professional features.')
                ->action('Go to Dashboard', url('/dashboard'));
        } else {
            $message->line('Reason for rejection: '.($this->reason ?? 'No specific reason provided.'))
                ->line('Please update your profile details and try again.');
        }

        return $message;
    }

    /**
     * Get the array representation of the notification.
     *
     * @return array<string, mixed>
     */
    public function toArray(object $notifiable): array
    {
        return [
            'status' => $this->status,
            'professional_type' => $this->professionalType,
            'reason' => $this->reason,
            'message' => 'Your '.$this->professionalType.' verification request was '.$this->status.'.',
        ];
    }
}
