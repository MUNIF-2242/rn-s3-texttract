import React, { useEffect } from "react";
import { View, Button, Alert } from "react-native";
import * as ImagePicker from "expo-image-picker";
import { S3, Textract } from "aws-sdk/dist/aws-sdk-react-native";

export default function App() {
  console.log("AWS Region:", process.env.EXPO_PUBLIC_AWS_REGION);
  console.log("AWS Access Key:", process.env.EXPO_PUBLIC_AWS_ACCESS_KEY);
  console.log(
    "AWS Secret Access Key:",
    process.env.EXPO_PUBLIC_AWS_SECRET_ACCESS_KEY
  );
  console.log("AWS Bucket Name:", process.env.EXPO_PUBLIC_AWS_BUCKET_NAME);
  useEffect(() => {
    // Request permission to access camera roll
    (async () => {
      const { status } =
        await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (status !== "granted") {
        Alert.alert(
          "Permission required",
          "Please enable media library access to use this feature."
        );
      }
    })();
  }, []);

  const s3 = new S3({
    region: process.env.EXPO_PUBLIC_AWS_REGION, // Replace with your AWS region
    credentials: {
      accessKeyId: process.env.EXPO_PUBLIC_AWS_ACCESS_KEY, // Replace with your AWS access key ID
      secretAccessKey: process.env.EXPO_PUBLIC_AWS_SECRET_ACCESS_KEY, // Replace with your AWS secret access key
    },
  });

  const textract = new Textract({
    region: process.env.EXPO_PUBLIC_AWS_REGION, // Replace with your AWS region
    credentials: {
      accessKeyId: process.env.EXPO_PUBLIC_AWS_ACCESS_KEY, // Replace with your AWS access key ID
      secretAccessKey: process.env.EXPO_PUBLIC_AWS_SECRET_ACCESS_KEY, // Replace with your AWS secret access key
    },
  });

  const uploadImageToS3 = async (fileUri, fileName) => {
    try {
      if (!fileUri) {
        throw new Error("File URI is undefined or null.");
      }

      const fileType = fileUri.split(".").pop(); // Get the file extension
      const response = await fetch(fileUri); // Fetch the file data
      const blob = await response.blob(); // Convert the data into Blob format

      const params = {
        Bucket: process.env.EXPO_PUBLIC_AWS_BUCKET_NAME, // Replace with your S3 bucket name
        Key: fileName, // File name in S3
        ContentType: `image/${fileType}`, // Content type of the file
        Body: blob, // Pass the Blob data to the Body parameter
      };

      const data = await s3.upload(params).promise();
      console.log("Upload successful:", data.Location);

      // After upload, call Textract to extract data from the image
      await extractTextFromImage(data.Location);
      Alert.alert("Upload successful", "Image uploaded successfully to S3.");
    } catch (error) {
      console.error("Upload error:", error);
      Alert.alert("Upload failed", "Failed to upload image to S3.");
    }
  };

  const extractTextFromImage = async (imageUrl) => {
    const params = {
      Document: {
        S3Object: {
          Bucket: process.env.EXPO_PUBLIC_AWS_BUCKET_NAME, // Replace with your S3 bucket name
          Name: imageUrl.split("/").pop(), // Extract the object name from the URL
        },
      },
      FeatureTypes: ["TABLES", "FORMS"], // Specify the feature types you want to extract
    };

    try {
      const response = await textract.analyzeDocument(params).promise();
      console.log("Text extracted:", response.Blocks);
      // Process or display the extracted text as needed
    } catch (error) {
      console.error("Textract error:", error);
      Alert.alert("Textract failed", "Failed to extract text from the image.");
    }
  };

  const pickImage = async () => {
    try {
      let result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.Images,
        allowsEditing: true,
        aspect: [4, 3],
        quality: 1,
      });

      console.log(result);

      if (!result.cancelled) {
        const uri = result.assets[0].uri;
        const fileName = `image-${Date.now()}.jpg`; // Generate a unique file name
        console.log(uri, fileName);

        // Call uploadImageToS3 with the selected image URI and file name
        await uploadImageToS3(uri, fileName);
      }
    } catch (error) {
      console.error("Image picker error:", error);
      Alert.alert("Image picker failed", "Failed to pick an image.");
    }
  };

  return (
    <View style={{ flex: 1, justifyContent: "center", alignItems: "center" }}>
      <Button title="Pick an image from camera roll" onPress={pickImage} />
    </View>
  );
}
