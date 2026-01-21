<?php
use App\Http\Controllers\Auth\ForgotPasswordController;
use App\Http\Controllers\Auth\ResetPasswordController;
use App\Http\Controllers\ArsitekController;
use App\Http\Controllers\Index;
use App\Http\Controllers\CariRumahController;
use App\Http\Controllers\BeliMaterialController;
use App\Http\Controllers\ForumProjectController;
use App\Http\Controllers\AdminController;
use App\Http\Controllers\ProvinceController;
use Illuminate\Support\Facades\Auth;
use App\Http\Controllers\CityController;
use App\Http\Controllers\ContactController;
use App\Http\Controllers\HouseController;
use App\Http\Controllers\PermissionController;
use App\Http\Controllers\ProfileController;
use App\Http\Controllers\ProfilController;
use App\Http\Controllers\RoleController;
use App\Http\Controllers\UserController;
use Illuminate\Support\Facades\Route;
use App\Http\Controllers\ArsitekAdminController;
use App\Http\Controllers\KontraktorController;
use App\Http\Controllers\KontraktorDashboardController;
use App\Http\Controllers\ProjectController;
use App\Http\Controllers\BidArsitekController;
use App\Http\Controllers\BidKontraktorController;
use App\Http\Controllers\ArsitekRiwayatController;
use App\Http\Controllers\ArsitekRatingController;
use App\Http\Controllers\RatingController;
use App\Http\Controllers\KontraktorRatingController;
Route::get('forgot-password', [ForgotPasswordController::class, 'showLinkRequestForm'])->name('password.request');
Route::post('forgot-password', [ForgotPasswordController::class, 'sendResetLinkEmail'])->name('password.email');

Route::get('reset-password/{token}', [ResetPasswordController::class, 'showResetForm'])->name('password.reset');
Route::post('reset-password', [ResetPasswordController::class, 'reset'])->name('password.update');

Route::get('/', [Index::class, 'index'])->name('index');
Route::get('/dashboard', [HouseController::class, 'dashboard'])->middleware(['auth', 'verified'])->name('cariRumah');

// Route::middleware(['auth', 'verified'])->group(function () {
//     Route::get('/dashboard', function () {
//         $user = Auth::user();
//         if ($user->role_type === 'arsitek') {
//             return redirect()->route('users-page.adminArsitek');
//         } elseif ($user->role_type === 'kontraktor') {
//             return redirect()->route('kontraktor.dashboard'); // Jika ada kontraktor
//         } else {
//             return view('dashboard'); // Halaman user biasa
//         }
//     })->name('dashboard');
// });


Route::get('/dashboard/getRegion/{provinceId}', [HouseController::class, 'getRegion'])->middleware(['auth', 'verified'])->name('dashboard-getRegions');

//house
Route::middleware(['permission:house-view'])->group(function(){
    Route::get('/houses_list', [HouseController::class, 'displayAll'])->name('houses-list');
});

//users
Route::middleware(['permission:user-view'])->group(function(){
    Route::get('/users_list', [UserController::class, 'display'])->name('users.list');
    Route::get('/user_edit_form/{id}', [UserController::class, 'formEdit'])->name('user.edit.form');
});
Route::middleware(['permission:user-edit'])->group(function(){
    Route::put('/user-edit/{id}', [UserController::class, 'editUser'])->name('user.edit');
});

//roles
Route::middleware(['permission:role-view'])->group(function(){
    Route::get('/roles', [RoleController::class, 'index'])->name('role.list');
    Route::get('/roles/view/{id}', [RoleController::class, 'view'])->name('role.view');
});
Route::middleware(['permission:role-create'])->group(function(){
    Route::get('/roles/create', [RoleController::class, 'roleCreateForm'])->name('role.create.form');
    Route::post('/roles/create/post', [RoleController::class, 'createRole'])->name('role.create');
});
Route::middleware(['permission:role-edit'])->group(function(){
    Route::get('/roles/view/{id}', [RoleController::class, 'view'])->name('role.view');
    Route::put('/role/edit/{id}', [RoleController::class, 'editRole'])->name('role.edit');
});
Route::middleware(['permission:role-delete'])->group(function(){
    Route::delete('/role/delete/{id}', [RoleController::class, 'destroyRole'])->name('role.destroy');
});

//permissions
Route::middleware(['permission:permission-view'])->group(function(){
    Route::get('/permissions', [PermissionController::class, 'index'])->name('permissions.list');
});

Route::middleware(['permission:permission-create'])->group(function(){
    Route::get('/permissions/create', [PermissionController::class, 'createPermissionForm'])->name('permission.create.form');
    Route::post('/permissions/create/post', [PermissionController::class, 'createPermission'])->name('permission.create');
});
//contact
Route::middleware(['permission:contact-view'])->group(function(){
    Route::get('/contact', [ContactController::class, 'contactList'])->name('contact.list');
});

Route::middleware(['permission:contact-create'])->group(function(){
    Route::get('/contact/create', [ContactController::class, 'contactCreateForm'])->name('contact.create.form');
    Route::post('/contact/create/post', [ContactController::class, 'contactCreate'])->name('contact.create');
});
Route::middleware(['permission:contact-edit'])->group(function(){
    Route::get('/contact/view/{id}', [ContactController::class, 'contactView'])->name('contact.view');
    Route::put('/contact/edit/{id}', [ContactController::class, 'contactEdit'])->name('contact.edit');
});




// INI REAL ARSITEK
Route::middleware(['auth', 'role:arsitek'])->group(function () {
    Route::get('/arsitek/admin', [ArsitekAdminController::class, 'index'])
        ->name('users-page.adminArsitek');
        Route::get('/arsitek/bidding', [ArsitekAdminController::class, 'bidding'])
        ->name('arsitek.bidding');
        Route::put('/arsitek/update-profile', [ArsitekAdminController::class, 'update'])->name('arsitek.updateProfile');
        Route::get('/formulir-bid-arsitek/{project}', [BidArsitekController::class, 'formBid'])->name('formulir.bid.arsitek');
Route::post('/formulir-bid-arsitek/{project}', [BidArsitekController::class, 'submitBid'])->name('bid.arsitek');

});
Route::middleware(['auth'])->group(function () {
    Route::get('/arsitek/riwayat-project', [ArsitekRiwayatController::class, 'index'])->name('arsitek.riwayat');
});
// INI REAL Kontraktor
Route::middleware(['auth', 'role:kontraktor'])->group(function () {
    Route::get('/kontraktor/admin', [KontraktorDashboardController::class, 'index'])
        ->name('users-page.adminKontraktor');
        Route::get('/kontraktor/bidding', [KontraktorDashboardController::class, 'bidding'])
        ->name('kontraktor.bidding');
        Route::put('/kontraktor/update-profile', [KontraktorDashboardController::class, 'update'])->name('kontraktor.updateProfile');
        Route::get('/kontraktor/ajukan-spesialisasi', function () {
            return view('users-page.ajukan-spesialisasi', [
                'spesialisasiList' => \App\Models\Spesialisasi::orderBy('nama')->get(),
                'kontraktor' => Auth::user()->kontraktor
            ]);
        })->name('kontraktor.form-ajukan-spesialisasi');
    
        Route::post('/kontraktor/ajukan-spesialisasi', [KontraktorController::class, 'ajukanSpesialisasi'])
            ->name('kontraktor.ajukan-spesialisasi');
            Route::get('/formulir-bid-kontraktor/{project}', [BidKontraktorController::class, 'formBid'])->name('formulir.bid.kontraktor');

});
Route::get('/kontraktor/riwayat-project', [KontraktorDashboardController::class, 'riwayatProject'])
    ->name('kontraktor.riwayat');

Route::put('/project/{id}/update-status-kontraktor', [ProjectController::class, 'updateStatusKontraktor'])
    ->name('project.updateStatusKontraktor');

// Route::middleware(['auth', 'role:arsitek'])->group(function () {
//     Route::get('/arsitek/bidding', function () {
//         return view('users-page.arsitek-bidding');
//     })->name('arsitek.bidding');
// });
Route::get('/arsitek', [ArsitekController::class, 'index'])->middleware(['auth', 'verified'])->name('arsitek');
Route::get('/arsitek/{id}', [ArsitekController::class, 'show'])->name('arsitek.detail');
Route::get('/project/{id}/bids', [BidArsitekController::class, 'showBids'])->name('bids.arsitek');
// Route::get('/arsitek', [ArsitekController::class, 'index'])->name('arsitek.list');



// kontraktor
Route::middleware(['auth',  'role:kontraktor'])->group(function () {
    Route::get('/dashboardKontraktor', [KontraktorDashboardController::class, 'index'])
        ->name('users-page.adminKontraktor'); 
});

Route::get('/kontraktor', [KontraktorController::class, 'index'])->middleware(['auth', 'verified'])->name('kontraktor.list');
Route::get('/kontraktor/{id}', [KontraktorController::class, 'show'])->name('kontraktor.detail');

// userPostProject
Route::post('/project/store', [ProjectController::class, 'store'])->name('project.store');
// edit,delete,dll
Route::get('/project/edit/{id}', [ProjectController::class, 'edit'])->name('project.edit');
Route::put('/project/update/{id}', [ProjectController::class, 'update'])->name('project.update');
Route::delete('/project/delete/{id}', [ProjectController::class, 'destroy'])->name('project.delete');





// bidProject
Route::middleware(['auth'])->group(function () {
    // Forum Project
    Route::get('/forum-project', [ProjectController::class, 'index'])->name('forum.project');
    Route::get('/form-post-project', [ProjectController::class, 'formPostProject'])->name('form.post.project');
    Route::get('/forum-project/{id}', [ProjectController::class, 'show'])->name('forum.project.detail');
    Route::post('/form-post-project', [ProjectController::class, 'store'])->name('project.store');

    // Bidding Arsitek
    Route::post('/arsitek/bid/{project}/{arsitek}/select', [BidArsitekController::class, 'selectBid'])
    ->name('bid.arsitek.select')
    ->middleware(['auth', 'role:user']);

    Route::post('/arsitek/bid/{project}', [BidArsitekController::class, 'store'])
    ->name('bid.arsitek')
    ->middleware(['auth', 'role:arsitek']);
   



    // Bidding Kontraktor
    Route::put('/project/{id}/update-status-kontraktor', [ProjectController::class, 'updateStatusKontraktor'])
    ->name('project.updateStatusKontraktor');
    
    Route::post('/kontraktor/bid/{project}', [BidKontraktorController::class, 'store'])->name('bid.kontraktor');
    Route::post('/project/{project}/select-kontraktor/{kontraktor}', [BidKontraktorController::class, 'selectBid'])
    ->name('bid.kontraktor.select');

});
Route::put('/project/{id}/mark-completed', [ProjectController::class, 'markCompleted'])->name('project.markCompleted');



Route::middleware(['auth'])->group(function () {
    Route::get('/admin', [AdminController::class, 'index'])->name('users-page.admin');
    Route::get('/admin/manage-users', [AdminController::class, 'manageUsers'])->name('admin.manage-users');
    Route::delete('/admin/delete-user/{id}', [AdminController::class, 'deleteUser'])->name('admin.delete-user');
    Route::get('/admin/pengajuan-spesialisasi', [AdminController::class, 'kelolaPengajuanSpesialisasi'])->name('admin.pengajuan-spesialisasi');

    Route::post('/admin/pengajuan-spesialisasi/{id}/proses', [AdminController::class, 'prosesPengajuan'])->name('admin.proses-pengajuan-spesialisasi');
    Route::post('/admin/pengajuan-spesialisasi/{id}/terima', [AdminController::class, 'terimaPengajuan'])->name('admin.terima-pengajuan');
    Route::post('/admin/pengajuan-spesialisasi/{id}/tolak', [AdminController::class, 'tolakPengajuan'])->name('admin.tolak-pengajuan');

    Route::get('/admin/rumah-user', [AdminController::class, 'daftarRumahUser'])->name('admin.rumah-user');
    Route::get('house/detailHouseAdmin/{id}', [AdminController::class, 'DetaildaftarRumahUser'])->name('admin.house.detail');
    Route::resource('house', HouseController::class);
    Route::get('/admin/rumah/{id}/edit', [AdminController::class, 'editRumah'])->name('admin.edit-rumah');
Route::post('/admin/rumah/{id}/update', [AdminController::class, 'updateRumah'])->name('admin.update-rumah');
Route::delete('/admin/rumah/{id}/delete', [AdminController::class, 'destroyRumah'])->name('admin.delete-rumah');


Route::get('/admin/project', [AdminController::class, 'showProjects'])->name('admin.project');
// Menampilkan form edit proyek
Route::get('/admin/project/{id}/edit', [AdminController::class, 'editProject'])->name('admin.project.edit');

// Menghapus proyek
Route::delete('/admin/project/{id}', [AdminController::class, 'deleteProject'])->name('admin.project.delete');

Route::put('/admin/project/{id}', [AdminController::class, 'updateProject'])->name('admin.project.update');




});

Route::get('/project/riwayat', [ProjectController::class, 'riwayat'])->name('user.project.riwayat');
// Menampilkan form rating
Route::get('/project/{project_id}/rating/{tipe}', [RatingController::class, 'showForm'])->name('user.rating.form');



// Menyimpan rating
Route::post('/project/{project_id}/rating', [RatingController::class, 'submit'])->name('user.rating.submit');





Route::middleware('auth')->group(function () {

    Route::get('/house/view/{id}', [HouseController::class, 'viewHouse'])->name('house.view');
    Route::get('/profile/{tab}', [ProfileController::class, 'edit'])->name('profile.edit');
    Route::post('/profile/add_phone_number', [ProfileController::class, 'addPhoneNumber'])->name('profile.addPhoneNumber');
    Route::patch('/profile/{id}', [ProfileController::class, 'update'])->name('profile.update');
    Route::delete('/profile', [ProfileController::class, 'destroy'])->name('profile.destroy');
    Route::delete('/profile/delete_phone_number/{id}', [ProfileController::class, 'deletePhoneNumber'])->name('phoneNumber.destroy');
    Route::put('/profile/edit_phone_number/{id}', [ProfileController::class, 'editPhoneNumber'])->name('update.phoneNumber');
    Route::delete('/profile/pic/delete', [ProfileController::class, 'deleteProfilePicture'])->name('profile.pic.delete');






  



    Route::get('/house', [HouseController::class, 'index'])->name('house.index');
    Route::get('/create_house_form', [HouseController::class, 'formCreateHouse'])->name('house.create.form');
    Route::post('/create_house', [HouseController::class, 'createHouse'])->name('house.create');
    Route::get('/house_edit_form/{id}',[HouseController::class, 'formEditHouse'])->name('house.edit.form');
    Route::put('/house/edit/{id}', [HouseController::class, 'editHouse'])->name('house.edit');
    Route::get('/house/list', [HouseController::class, 'displayOwnedHouse'])->name('user-houses-list');
    Route::delete('/house/delete/{id}', [HouseController::class, 'destroyHouse'])->name('user-house-delete');
    Route::get('/detail_house/{id}', [HouseController::class, 'displayDetail'])->name('house.detail');

    Route::get('/create_house_detail_form/{id}', [HouseController::class, 'formCreateDimension'])->name('house.detail.dimension.create.form');
    Route::put('/create_house_detail/{id}', [HouseController::class, 'createDimension'])->name('house.detail.dimension.create');
    Route::put('/house/detail/edit/{id}', [HouseController::class, 'editDimension'])->name('house.detail.dimension.edit');
    Route::put('/house/detail/delete/{id}', [HouseController::class, 'destroyDimension'])->name('house.detail.dimension.delete');

    Route::get('/house/room/detail/{id}', [HouseController::class, 'displayRoomDetail'])->name('house.room.detail');
    Route::put('/house/room/edit/{id}', [HouseController::class, 'editRoom'])->name('house.room.edit');
    Route::post('/house/room/create', [HouseController::class, 'createRoom'])->name('house.room.create');
    Route::post('/house/room/picUp/{id}',[HouseController::class, 'createRoomPic'])->name('house.room.pic.create');
    Route::delete('/house/room/picDel/{id}',[HouseController::class, 'destroyRoomPic'])->name('house.room.pic.delete');
    
    Route::get('/house_address_create/{id}', [HouseController::class, 'formCreateAddress'])->name('house.address.create.form');
    Route::patch('/house/add_address/{id}',[HouseController::class, 'createAddress'])->name('house.address.create');
    Route::delete('/house/address/delete/{id}', [HouseController::class, 'destroyAddress'])->name('house.address.delete');

    Route::post('/house/pic/upload/{id}', [HouseController::class, 'createHousePic'])->name('house.pic.create');
    Route::delete('/house/pic/delete/{id}', [HouseController::class, 'destroyHousePic'])->name('house.pic.delete');

    Route::get('/search-province', [ProvinceController::class, 'searchProvince']);
    Route::get('/search-city', [CityController::class, 'searchCity']);
});



require __DIR__.'/auth.php';

