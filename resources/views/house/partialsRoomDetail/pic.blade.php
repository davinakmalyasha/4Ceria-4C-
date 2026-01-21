<section>
    <div class="bg-white dark:bg-gray-800 overflow-hidden shadow-sm sm:rounded-lg my-4">
        <div class="px-4 py-1">
            <div class="px-4 py-2">
                <h3 class="font-semibold text-xl text-gray-800 dark:text-gray-200 leading-tight">House Pics</h3>
                <div class="px-2 py-1 flex flex-row gap-4">
                    <!-- Upload Form -->
                    <div class="flex flex-col w-1/4">
                        <form method="POST" action="{{ route('house.room.pic.create', $room->id) }}" enctype="multipart/form-data">
                            @csrf
                            @method('POST')
                            <label class="text-gray-800 dark:text-gray-200 whitespace-nowrap" for="file_input">Upload file</label>
                            <input aria-describedby="file_input_help" id="file_input" type="file" name="room_pic">
                            <input type="hidden" name="id_house" id="" value="{{$room->id_house}}">
                            <p class="mt-1 text-sm text-gray-500 dark:text-gray-300" id="file_input_help">PNG Or JPG (MAX. 800x400px).</p>
                            <button type="submit">Upload</button>
                            @if(session('success'))
                                <div>
                                    {{ session('success') }}
                                </div>
                            @endif
                            @if(session('error'))
                                <div class="text-red dark:text-red-600 mt-2">
                                    {{ session('error') }}
                                </div>
                            @endif
                            @error('room_pic')
                                <div class="text-red dark:text-red-600 mt-2">{{ $message }}</div>
                            @enderror
                        </form>
                    </div>

                    <div class="flex flex-col w-3/4">
                        <div class="bg-white dark:bg-gray-900 h-full rounded-lg overflow-y-auto">
                            
                                @if($room->roomPic->isEmpty())
                                    <h3>No Picture</h3>
                                @else
                                    <h3>List Of Pictures</h3>
                                    <div>
                                    @foreach($room->roomPic as $items)

                                    <div>
                                        <img src="{{ asset('storage/'.$items->dir) }}" alt="">
                                        
                                        <div id="deletePicModal">
                                            <div>
                                                <h2 class="text-lg font-semibold text-gray-800 dark:text-gray-200 text-center">Confirm Delete</h2>
                                                <p class="text-gray-600 dark:text-gray-400 text-sm text-center mt-2">
                                                    Are you sure you want to delete this item (ID: <span id="deleteItemId" class="font-bold"></span>)? This action cannot be undone.
                                                </p>
                                                <div class="mt-4 flex justify-center gap-4">
                                                    <button id="cancelPicButton" class="py-2 px-4 bg-gray-300 hover:bg-gray-400 text-gray-700 rounded-md">
                                                        Cancel
                                                    </button>
                                                    <form id="deletePicForm" method="POST" action="{{route('house.room.pic.delete', $items->id)}}">
                                                        @csrf
                                                        @method('DELETE')
                                                        <button type="submit" class="py-2 px-4 bg-red-600 hover:bg-red-700 text-white rounded-md">
                                                            Delete
                                                        </button>
                                                    </form>
                                                </div>
                                            </div>
                                        </div>
                                        
                                            <button class="my-2 py-2 px-4 rounded-md border border-2 text-white font-medium bg-blue-700 hover:bg-blue-800
                                            dark:bg-red-600 border-gray-800 dark:hover:bg-red-800 dark:border-red-600 dark:hover:border-red-800
                                            justify-self-center" onclick="openDeleteModal()">
                                                Delete
                                            </button>
                                        
                                    </div>
                                    @endforeach
                                @endif
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    </div>

    

    <script>
        function openDeleteModal(id) {
            const modal = document.getElementById('deletePicModal');
            const deleteForm = document.getElementById('deletePicForm');
            const deleteItemId = document.getElementById('deleteItemId');

            modal.classList.remove('hidden'); // Show the modal
    }

    // Close the modal when the cancel button is clicked
    document.getElementById('cancelPicButton').addEventListener('click', () => {
        document.getElementById('deletePicModal').classList.add('hidden'); // Hide the modal
    });
    </script>
</section>
