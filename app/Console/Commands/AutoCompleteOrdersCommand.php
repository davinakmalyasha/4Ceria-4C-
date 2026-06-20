<?php

namespace App\Console\Commands;

use Illuminate\Console\Command;
use App\Services\OrderService;

class AutoCompleteOrdersCommand extends Command
{
    /**
     * The name and signature of the console command.
     *
     * @var string
     */
    protected $signature = 'app:auto-complete-orders';

    /**
     * The console command description.
     *
     * @var string
     */
    protected $description = 'Automatically completes delivered material orders past 3 days';

    /**
     * Execute the console command.
     */
    public function handle(OrderService $orderService): int
    {
        $this->info('Starting auto-completion of delivered orders...');
        $completedCount = $orderService->autoCompleteOrders();
        $this->info("Successfully auto-completed {$completedCount} orders.");
        return Command::SUCCESS;
    }
}
