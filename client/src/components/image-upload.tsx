import { useCallback, useState } from "react";
import { useDropzone } from "react-dropzone";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Loader2, X } from "lucide-react";

interface ImageUploadProps {
  onImagesChange: (images: { file: File; caption: string }[]) => void;
  maxFiles?: number;
}

export function ImageUpload({
  onImagesChange,
  maxFiles = 5,
}: ImageUploadProps) {
  const [images, setImages] = useState<{ file: File; caption: string }[]>([]);
  const [isProcessing, setIsProcessing] = useState(false);

  const onDrop = useCallback(
    async (acceptedFiles: File[]) => {
      setIsProcessing(true);
      const newImages = [...images];

      for (const file of acceptedFiles) {
        if (newImages.length >= maxFiles) {
          break;
        }

        // Check if file is an image
        if (!file.type.startsWith("image/")) {
          console.error("Invalid file type:", file.type);
          continue;
        }

        const fileSizeMB = file.size / 1024 / 1024;
        console.log(
          `Processing file: ${file.name} (${fileSizeMB.toFixed(2)} MB)`
        );

        newImages.push({ file, caption: "" });
      }

      setImages(newImages);
      onImagesChange(newImages);
      setIsProcessing(false);
    },
    [images, maxFiles, onImagesChange]
  );

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: {
      "image/*": [".png", ".jpg", ".jpeg", ".gif", ".webp"],
    },
    maxFiles: maxFiles - images.length,
  });

  const removeImage = (index: number) => {
    const newImages = images.filter((_, i) => i !== index);
    setImages(newImages);
    onImagesChange(newImages);
  };

  const updateCaption = (index: number, caption: string) => {
    const newImages = [...images];
    newImages[index].caption = caption;
    setImages(newImages);
    onImagesChange(newImages);
  };

  return (
    <div className="space-y-4">
      <div
        {...getRootProps()}
        className={`border-2 border-dashed rounded-lg p-6 text-center cursor-pointer transition-colors
          ${
            isDragActive
              ? "border-primary bg-primary/5"
              : "border-muted-foreground/25"
          }
          ${
            images.length >= maxFiles
              ? "opacity-50 cursor-not-allowed"
              : "hover:border-primary hover:bg-primary/5"
          }`}
      >
        <input {...getInputProps()} disabled={images.length >= maxFiles} />
        {isProcessing ? (
          <div className="flex items-center justify-center">
            <Loader2 className="h-6 w-6 animate-spin" />
            <span className="ml-2">Processing images...</span>
          </div>
        ) : (
          <div>
            <p className="text-sm font-medium">
              {isDragActive
                ? "Drop the images here..."
                : images.length >= maxFiles
                ? "Maximum number of images reached"
                : "Drag & drop images here, or click to select"}
            </p>
            <p className="text-xs text-muted-foreground mt-1">
              Supported formats: PNG, JPG, GIF, WEBP
            </p>
            <p className="text-xs text-muted-foreground">
              Maximum file size: 5MB (larger images will be automatically
              compressed)
            </p>
            <p className="text-xs text-muted-foreground">
              {images.length} of {maxFiles} images uploaded
            </p>
          </div>
        )}
      </div>

      <div className="space-y-4">
        {images.map((image, index) => (
          <div
            key={index}
            className="relative border rounded-lg p-4 flex items-start space-x-4"
          >
            <div className="relative w-24 h-24 flex-shrink-0">
              <img
                src={URL.createObjectURL(image.file)}
                alt={`Preview ${index + 1}`}
                className="w-full h-full object-cover rounded-md"
              />
              <Button
                type="button"
                variant="destructive"
                size="icon"
                className="absolute -top-2 -right-2 h-6 w-6"
                onClick={() => removeImage(index)}
              >
                <X className="h-4 w-4" />
              </Button>
            </div>
            <div className="flex-grow">
              <p className="text-sm font-medium mb-1">
                {image.file.name}{" "}
                <span className="text-muted-foreground">
                  ({(image.file.size / 1024 / 1024).toFixed(2)} MB)
                </span>
              </p>
              <Input
                type="text"
                placeholder="Add a caption (optional)"
                value={image.caption}
                onChange={(e) => updateCaption(index, e.target.value)}
                className="mt-2"
              />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
