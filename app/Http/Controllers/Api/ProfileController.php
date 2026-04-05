<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Storage;
use App\Models\Arsitek;
use App\Models\Kontraktor;

class ProfileController extends Controller
{
    public function updateProfessional(Request $request)
    {
        $user = $request->user();
        
        $validatedUser = $request->validate([
            'name' => 'required|string|max:255',
            'email' => 'required|email|max:255|unique:users,email,' . $user->id,
            'username' => 'required|string|max:255|unique:users,username,' . $user->id,
            'phone_numbers' => 'nullable|string', // Received as JSON string due to FormData
        ]);

        $user->update([
            'name' => $validatedUser['name'],
            'email' => $validatedUser['email'],
            'username' => $validatedUser['username'],
        ]);

        if ($request->has('phone_numbers')) {
            $phones = json_decode($request->phone_numbers, true);
            if (is_array($phones)) {
                $user->phoneNumber()->whereNotIn('contact', $phones)->delete();
                $existing = $user->phoneNumber()->pluck('contact')->toArray();
                foreach ($phones as $num) {
                    if (!in_array($num, $existing) && !empty(trim($num))) {
                        $user->phoneNumber()->create(['contact' => trim($num)]);
                    }
                }
            }
        }

        if ($user->role_type === 'arsitek') {
            $validatedArsitek = $request->validate([
                'rate_harga' => 'nullable|numeric',
                'pengalaman_tahun' => 'nullable|numeric',
                'spesialisasi' => 'nullable|string',
                'lokasi' => 'nullable|string',
                'no_telp' => 'nullable|string',
                'deskripsi' => 'nullable|string',
                'pendidikan' => 'nullable|string',
                'alasan_hire' => 'nullable|string',
                'foto' => 'nullable|file|mimes:jpg,png,jpeg|max:5120',
                'file_portofolio' => 'nullable|file|mimes:pdf,zip,jpg,png|max:10240',
                'file_sertifikat' => 'nullable|file|mimes:pdf,jpg,png|max:5120',
            ]);

            $arsitek = $user->arsitek;
            if (!$arsitek) {
                $arsitek = Arsitek::create(['user_id' => $user->id, 'nama' => $user->name]);
            }

            if ($request->hasFile('file_portofolio')) {
                if ($arsitek->file_portofolio) {
                    Storage::disk('public')->delete($arsitek->file_portofolio);
                }
                $validatedArsitek['file_portofolio'] = $request->file('file_portofolio')->store('portfolios', 'public');
            } else {
                 unset($validatedArsitek['file_portofolio']);
            }

            if ($request->hasFile('file_sertifikat')) {
                if ($arsitek->file_sertifikat) {
                    Storage::disk('public')->delete($arsitek->file_sertifikat);
                }
                $validatedArsitek['file_sertifikat'] = $request->file('file_sertifikat')->store('certificates', 'public');
            } else {
                 unset($validatedArsitek['file_sertifikat']);
            }
            
            if ($request->hasFile('foto')) {
                if ($arsitek->foto) {
                    Storage::disk('public')->delete($arsitek->foto);
                }
                $validatedArsitek['foto'] = $request->file('foto')->store('portfolios/photos', 'public');
            } else {
                 unset($validatedArsitek['foto']);
            }

            $arsitek->update($validatedArsitek);
        }

        if ($user->role_type === 'kontraktor') {
            $validatedKontraktor = $request->validate([
                'nama_perusahaan' => 'nullable|string',
                'alamat' => 'nullable|string',
                'no_telepon' => 'nullable|string',
                'rate_harga' => 'nullable|numeric',
                'pengalaman' => 'nullable|string',
                'jenis' => 'nullable|string',
                'pendidikan' => 'nullable|string',
                'alasan_hire' => 'nullable|string',
                'foto' => 'nullable|file|mimes:jpg,png,jpeg|max:5120',
                'npwp' => 'nullable|file|mimes:pdf,jpg,png|max:5120',
                'siup' => 'nullable|file|mimes:pdf,jpg,png|max:5120',
            ]);

            $kontraktor = $user->kontraktor;
            if (!$kontraktor) {
                $kontraktor = Kontraktor::create(['user_id' => $user->id, 'nama' => $user->name]);
            }

            if ($request->hasFile('npwp')) {
                if ($kontraktor->npwp) {
                    Storage::disk('public')->delete($kontraktor->npwp);
                }
                $validatedKontraktor['npwp'] = $request->file('npwp')->store('documents', 'public');
            } else {
                 unset($validatedKontraktor['npwp']);
            }

            if ($request->hasFile('siup')) {
                if ($kontraktor->siup) {
                    Storage::disk('public')->delete($kontraktor->siup);
                }
                $validatedKontraktor['siup'] = $request->file('siup')->store('documents', 'public');
            } else {
                 unset($validatedKontraktor['siup']);
            }
            
            if ($request->hasFile('foto')) {
                if ($kontraktor->foto) {
                    Storage::disk('public')->delete($kontraktor->foto);
                }
                $validatedKontraktor['foto'] = $request->file('foto')->store('portfolios/photos', 'public');
            } else {
                 unset($validatedKontraktor['foto']);
            }

            $kontraktor->update($validatedKontraktor);
        }

        return response()->json([
            'message' => 'Professional profile updated successfully',
            'user' => $user->fresh()->load(['phoneNumber', 'arsitek', 'kontraktor'])
        ]);
    }
}
