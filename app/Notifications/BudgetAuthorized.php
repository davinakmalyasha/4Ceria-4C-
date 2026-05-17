<?php

namespace App\Notifications;

use Illuminate\Bus\Queueable;
use Illuminate\Contracts\Queue\ShouldQueue;
use Illuminate\Notifications\Messages\MailMessage;
use Illuminate\Notifications\Notification;

class BudgetAuthorized extends Notification
{
    protected $project;
    protected $addendum;

    /**
     * Create a new notification instance.
     */
    public function __construct($project, $addendum)
    {
        $this->project = $project;
        $this->addendum = $addendum;
    }

    /**
     * Get the notification's delivery channels.
     *
     * @return array<int, string>
     */
    public function via(object $notifiable): array
    {
        return ['database', 'mail'];
    }

    /**
     * Get the mail representation of the notification.
     */
    public function toMail(object $notifiable): MailMessage
    {
        return (new MailMessage)
                    ->subject('Budget Authorized: Action Required')
                    ->line("The budget for '{$this->addendum->title}' has been authorized.")
                    ->line("Amount: Rp " . number_format($this->addendum->amount, 0, ',', '.'))
                    ->action('Go to Payments', url("/projects/{$this->project->id}?tab=payments"))
                    ->line('Please upload your proof of payment to finalize this assignment.');
    }

    /**
     * Get the array representation of the notification.
     *
     * @return array<string, mixed>
     */
    public function toArray(object $notifiable): array
    {
        return [
            'project_id' => $this->project->id,
            'title' => 'Budget Authorized',
            'message' => "Budget for '{$this->addendum->title}' is ready for payment.",
            'type' => 'budget_authorized',
            'addendum_id' => $this->addendum->id,
            'action_url' => "/projects/{$this->project->id}?tab=payments"
        ];
    }
}
