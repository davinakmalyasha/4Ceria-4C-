<?php

namespace App\Services;

use App\Models\Project;

class BidCalculationService
{
    /**
     * Calculate the total price of a bid based on the chosen fee type.
     *
     * @param array $data
     * @param Project $project
     * @return array
     */
    public function calculate(array $data, Project $project): array
    {
        $feeType = $data['fee_type'] ?? 'fixed';
        $priceInput = $data['price'] ?? 0;
        $unitPrice = $data['unit_price'] ?? 0;
        $quantity = $data['quantity'] ?? 0;

        $calculatedTotal = 0;

        switch ($feeType) {
            case 'percentage':
                // priceInput is treated as percentage (e.g. 5.00 for 5%)
                $projectBudget = (float) $project->budget;
                $calculatedTotal = ($priceInput / 100) * $projectBudget;
                break;

            case 'unit':
                // calculated based on unit_price * quantity
                $calculatedTotal = $unitPrice * $quantity;
                break;

            case 'fixed':
            default:
                $calculatedTotal = $priceInput;
                break;
        }

        return [
            'fee_type' => $feeType,
            'price' => $priceInput,
            'unit_price' => $unitPrice,
            'quantity' => $quantity,
            'calculated_total' => (int) round($calculatedTotal),
        ];
    }
}
