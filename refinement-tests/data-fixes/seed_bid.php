<?php
$u = App\Models\User::firstOrCreate(
    ['email' => 'budi_struc@gmail.com'], 
    ['name' => 'Budi Structural', 'username' => 'budi_struc', 'password' => bcrypt('password'), 'role_type' => 'structural']
); 
$profile = App\Models\StructuralEngineer::firstOrCreate(
    ['user_id' => $u->id], 
    ['experience_years' => 10, 'is_verified' => true, 'company_name' => 'Budi Structure Co.']
); 

App\Models\BidStructural::where('project_id', 13)->where('structural_id', $profile->id)->delete();

App\Models\BidStructural::create(
    ['project_id' => 13, 
    'structural_id' => $profile->id, 
    'price' => 15000000,
    'fee_type' => 'lump_sum',
    'calculated_total' => 15000000,
    'proposal' => 'I have evaluated your architectural layout and can provide the load-bearing calculations and force blueprints required for PBG compliance.', 
    'estimated_duration' => 14, 
    'duration_unit' => 'days',
    'scopes' => ['Force Calculation', 'Foundation Design'],
    'deliverables' => ['SAP2000 Model', 'Calculation Report PDF'],
    'status' => 'pending']
); 
echo "Profile and Bid created successfully.\n";
