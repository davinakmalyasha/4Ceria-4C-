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
        $priceInput = (float) ($data['price'] ?? 0);
        $unitPrice = (float) ($data['unit_price'] ?? 0);
        $quantity = (float) ($data['quantity'] ?? 0);

        $calculatedTotal = 0;

        switch ($feeType) {
            case 'percentage':
                // priceInput is treated as percentage (e.g. 5.00 for 5%)
                $projectBudget = (float) ($project->budget ?? 0);
                if ($projectBudget > 0) {
                    $calculatedTotal = ($priceInput / 100) * $projectBudget;
                } else {
                    // Fallback to price input if budget is missing, but this usually means budget isn't set
                    $calculatedTotal = $priceInput; 
                }
                break;

            case 'unit':
                // calculated based on unit_price * quantity
                $calculatedTotal = $unitPrice * $quantity;
                break;

            case 'sqm':
                // priceInput is treated as rate per sqm
                $dimensions = is_array($project->project_dimensions) ? $project->project_dimensions : json_decode($project->project_dimensions, true);
                $area = 1.0;
                if (!empty($dimensions)) {
                    $possibleKeys = ['building_area', 'building_size', 'renovation_area', 'area_size', 'land_area', 'land_size'];
                    foreach ($possibleKeys as $key) {
                        if (isset($dimensions[$key]) && (float)$dimensions[$key] > 0) {
                            $area = (float)$dimensions[$key];
                            break;
                        }
                    }
                }
                $calculatedTotal = $priceInput * $area;
                $quantity = $area;
                $unitPrice = $priceInput;
                break;

            case 'hourly':
                // For hourly, we treat priceInput as the base rate for quoting
                $calculatedTotal = $priceInput;
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
