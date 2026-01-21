<section>
    <div class="bg-white dark:bg-gray-800 overflow-hidden shadow-sm sm:rounded-lg my-4">
        <div class="px-4 py-1">
            <form method="POST" action="{{route('house.room.edit', $room->id)}}">
                @csrf
                @method('PUT')
                <div class="px-4 py-2">
                    <h3 class="font-semibold text-xl text-gray-800 dark:text-gray-200 leading-tight">Room Main Data</h3>
                </div>
                <div class="px-4 py-1 flex flex-row">
                    <div class="content-center px-2 flex flex-row items-center space-x-2">
                        <label>Name</label>
                        <input type="text" name="name" value="{{$room->name}}">

                    </div>
                    <div class="content-center px-2 flex flex-row items-center space-x-2">
                        <label class="text-gray-800 dark:text-gray-200 whitespace-nowrap">Width</label>
                        <input class="bg-gray-50 border border-gray-300 text-gray-900 text-sm rounded-lg focus:ring-blue-500 focus:border-blue-500 w-full
                        p-1.5 dark:bg-gray-800 dark:border-gray-600 dark:placeholder-gray-800 dark:text-white dark:focus:ring-blue-500
                        dark:focus:border-blue-500" type="text" name="width" value="{{$room->width}}">
                    </div>
                    <div class="content-center px-2 flex flex-row items-center space-x-2">
                        <label class="text-gray-800 dark:text-gray-200 whitespace-nowrap">Length</label>
                        <input class="bg-gray-50 border border-gray-300 text-gray-900 text-sm rounded-lg focus:ring-blue-500 focus:border-blue-500 w-full
                        p-1.5 dark:bg-gray-800 dark:border-gray-600 dark:placeholder-gray-800 dark:text-white dark:focus:ring-blue-500
                        dark:focus:border-blue-500" type="text" name="length" value="{{$room->length}}">
                    </div>
                </div>
                
                <div class="px-4 py-1 flex flex-row">
                    <div class="content-center px-2 flex flex-row items-center space-x-2">
                        <label class="text-gray-800 dark:text-gray-200 whitespace-nowrap">Desc</label>
                        <textarea name="desc" id=""class="block p-2.5 w-full text-sm text-gray-900 bg-gray-50 rounded-lg border border-gray-300 focus:ring-blue-500
                        focus:border-blue-500 dark:bg-gray-800 dark:border-gray-600 dark:placeholder-gray-400 dark:text-white dark:focus:ring-blue-500
                        dark:focus:border-blue-500">{{$room->desc}}</textarea>
                    </div>
                </div>
                <button class="my-2 rounded-md border border-2 border-gray-600 py-2 px-4 mx-6 hover:bg-gray-600 dark:bg-gray-8 dark:hover:bg-gray-600
                                text-gray-900 dark:text-white" type="submit">Edit</button>
                @error('name')
                <div class="text-red dark:text-red-600 mt-2">{{ $message }}</div>
                @enderror
                @error('width')
                <div class="text-red dark:text-red-600 mt-2">{{ $message }}</div>
                @enderror
                @error('length')
                <div class="text-red dark:text-red-600 mt-2">{{ $message }}</div>
                @enderror
                @error('desc')
                <div class="text-red dark:text-red-600 mt-2">{{ $message }}</div>
                @enderror
                
                
            </form>
        </div>
    </div>
</section>