
tinymce.init({
    selector: '#content',
    height: 800,
    plugins: [
        'advlist', 'autolink', 'lists', 'link', 'image', 'charmap', 'preview',
        'anchor', 'searchreplace', 'visualblocks', 'code', 'fullscreen',
        'insertdatetime', 'media', 'table', 'help', 'wordcount'
    ],
    toolbar: 'undo redo | blocks | ' +
        'bold italic backcolor | alignleft aligncenter ' +
        'alignright alignjustify | bullist numlist outdent indent | ' +
        'removeformat | help',
    content_style: 'body { font-family:Helvetica,Arial,sans-serif; font-size:16px }'
});

// Handle form submission
document.getElementById('blogForm').addEventListener('submit', async function (e) {
    e.preventDefault();

    const data = {
        title: document.getElementById('title').value,
        author: document.getElementById('author').value,
        read_time: document.getElementById('read_time').value,
        cover_image: document.getElementById('cover_image').value,
        content: tinymce.get('content').getContent()
    };

    // Here you would send data to backend using fetch():
    try {
        const request = await fetch("/v1/blog/create", {
            method: "POST",
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify(data),
        });

        const response = await request.json();
        if (response?.success) {
            alert("Blog Created Successfully!")
        } else {
           alert("Blog Creation Failed!") 
        }
        console.log("Upload Response:", response);

    } catch (error) {
        console.log(error)
        alert("Blog Creation Failed!")
    }
});











document.getElementById("uploadBtn").addEventListener("click", async () => {
    const fileInput = document.getElementById("fileInput");
    if (fileInput.files.length === 0) {
        alert("Please select a file.");
        return;
    }

    const file = fileInput.files[0];

    const formData = new FormData();
    formData.append("blog_image", file); // must match multer field name

    try {
        const res = await fetch("/v1/blog/image", {
            method: "POST",
            body: formData,
        });

        const data = await res.json();
        console.log("Upload Response:", data);

        // Assuming backend returns { url: "/blogs/image123.jpg" }
        document.getElementById("fileUrl").value = data.url;

        document.getElementById("result").style.display = "block";

    } catch (error) {
        console.error("Upload error:", error);
        alert("Failed to upload file.");
    }
});

document.getElementById("copyBtn").addEventListener("click", () => {
    const input = document.getElementById("fileUrl");
    input.select();
    input.setSelectionRange(0, 99999);
    navigator.clipboard.writeText(input.value);
    alert("URL copied to clipboard!");
});

