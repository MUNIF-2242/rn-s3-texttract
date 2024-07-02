import React, { useEffect, useState } from "react";
import {
  View,
  Button,
  Alert,
  Image,
  Text,
  TextInput,
  TouchableOpacity,
} from "react-native";
import * as ImagePicker from "expo-image-picker";
import { S3, Textract } from "aws-sdk/dist/aws-sdk-react-native";

export default function App() {
  console.log("App started");

  const [uploadedImageUrl, setUploadedImageUrl] = useState(null);
  const [showPassportNumber, setShowPassportNumber] = useState(null);
  const [showPersonalNumber, setShowPersonalNumber] = useState(null);
  const [showExpiryDate, setShowExpiryDate] = useState(null);
  const [mrzIsValid, setMrzIsValid] = useState(false);
  const [isLoading, setIsLoading] = useState(false);

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
      setIsLoading(true);
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

      // Set the uploaded image URL state
      setUploadedImageUrl(data.Location);

      // After upload, call Textract to extract data from the image
      await extractTextFromImage(data.Location);
      //Alert.alert("Upload successful", "Image uploaded successfully to S3.");
    } catch (error) {
      console.error("Upload error:", error);
      Alert.alert("Upload failed", "Failed to upload image to S3.");
    } finally {
      setIsLoading(false);
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
      FeatureTypes: ["TABLES"], // Specify the feature types you want to extract
    };

    try {
      const response = await textract.analyzeDocument(params).promise();
      //console.log("Text extracted:", response.Blocks);
      // Process or display the extracted text as needed

      const jsonData = response.Blocks;
      // Function to get the text of the last LINE block
      function getLastLineText(jsonData) {
        // Filter the blocks to get only those with BlockType 'LINE'
        const lineBlocks = jsonData.filter(
          (block) => block.BlockType === "LINE"
        );

        // Get the last block from the filtered blocks
        const lastLineBlock = lineBlocks[lineBlocks.length - 1];

        // Return the Text of the last block, or null if no LINE block is found
        return lastLineBlock ? lastLineBlock.Text : null;
      }
      const parseDate = (yyMMdd) => {
        const year = parseInt(yyMMdd.substring(0, 2), 10);
        const month = parseInt(yyMMdd.substring(2, 4), 10) - 1; // Month is 0-indexed in JavaScript Date
        const day = parseInt(yyMMdd.substring(4, 6), 10);

        // Determine the century for the year
        const fullYear = year >= 50 ? 1900 + year : 2000 + year;

        return new Date(fullYear, month, day);
      };
      const formatDate = (dateText) => {
        const parseDate = (yyMMdd) => {
          const year = parseInt(yyMMdd.substring(0, 2), 10);
          const month = parseInt(yyMMdd.substring(2, 4), 10) - 1; // Month is 0-indexed in JavaScript Date
          const day = parseInt(yyMMdd.substring(4, 6), 10);

          // Determine the century for the year
          const fullYear = year >= 50 ? 1900 + year : 2000 + year;

          return new Date(fullYear, month, day);
        };

        const date = parseDate(dateText);

        // Extract day, month, and year from the Date object
        const day = String(date.getDate()).padStart(2, "0");
        const month = date
          .toLocaleString("default", { month: "short" })
          .toUpperCase();
        const year = date.getFullYear();

        // Format the date components into the desired string
        return `${day} ${month} ${year}`;
      };

      // Get the text of the last LINE block
      const mrz = getLastLineText(jsonData);

      if (mrz) {
        console.log("Text of the last LINE block:", mrz);

        // Helper function to calculate the check digit
        const calculateCheckDigit = (input) => {
          const weights = [7, 3, 1];
          const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";
          let sum = 0;
          for (let i = 0; i < input.length; i++) {
            let value;
            if (input[i] >= "0" && input[i] <= "9") {
              value = parseInt(input[i]);
            } else if (input[i] >= "A" && input[i] <= "Z") {
              value = alphabet.indexOf(input[i]) + 10;
            } else {
              value = 0; // Placeholder < is treated as 0
            }
            sum += value * weights[i % 3];
          }
          return sum % 10;
        };

        // Extract relevant parts
        const passportNumber = mrz.substring(0, 9);
        const passportNumberCheckDigit = parseInt(mrz[9]);
        const birthDate = mrz.substring(13, 19);
        const birthDateCheckDigit = parseInt(mrz[19]);
        const expirationDate = mrz.substring(21, 27);
        const expirationDateCheckDigit = parseInt(mrz[27]);
        const personalNumber = mrz.substring(28, 42);

        const personalNumberCheckDigit = parseInt(mrz[42]);
        const finalCheckDigit = parseInt(mrz[43]);

        // Calculate and validate check digits
        const isPassportNumberValid =
          calculateCheckDigit(passportNumber) === passportNumberCheckDigit;
        const isBirthDateValid =
          calculateCheckDigit(birthDate) === birthDateCheckDigit;
        const isExpirationDateValid =
          calculateCheckDigit(expirationDate) === expirationDateCheckDigit;

        // Validate expiration date is not in the past
        const expirationDateObj = parseDate(expirationDate);
        const currentDate = new Date();
        const isExpirationDateNotExpired = expirationDateObj >= currentDate;

        const isPersonalNumberValid =
          calculateCheckDigit(personalNumber) === personalNumberCheckDigit;

        // Validate final check digit
        const combined =
          passportNumber +
          passportNumberCheckDigit +
          birthDate +
          birthDateCheckDigit +
          expirationDate +
          expirationDateCheckDigit +
          personalNumber +
          personalNumberCheckDigit;
        const isFinalCheckDigitValid =
          calculateCheckDigit(combined) === finalCheckDigit;

        const isValid =
          isPassportNumberValid &&
          isBirthDateValid &&
          isExpirationDateValid &&
          isPersonalNumberValid &&
          isFinalCheckDigitValid &&
          isExpirationDateNotExpired;

        console.log(
          `Passport Number: ${passportNumber} validity: ${isPassportNumberValid}`
        );
        console.log(`Birth Date: ${birthDate} validity: ${isBirthDateValid}`);
        console.log(
          `Expiration Date: ${expirationDate} validity: ${isExpirationDateValid}`
        );
        console.log(
          `Personal Number: ${personalNumber} validity: ${isPersonalNumberValid}`
        );
        console.log(
          `isExpirationDateNotExpired: ${isExpirationDateNotExpired}`
        );
        console.log("MRZ last line is valid: ", isValid);

        setMrzIsValid(isValid);
        setShowPassportNumber(passportNumber);
        setShowPersonalNumber(personalNumber.slice(0, 10));
        setShowExpiryDate(expirationDate);

        setShowExpiryDate(formatDate(expirationDate));
      } else {
        console.log("No LINE block found");
      }
    } catch (error) {
      console.error("Textract error:", error);
      //Alert.alert("Textract failed", "Failed to extract text from the image.");
    } finally {
      setIsLoading(false);
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

      console.log("result");
      console.log(result.assets[0].cancelled);

      if (!result.assets[0].cancelled) {
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
    <>
      <View
        style={{
          height: 400,
          alignItems: "center",
          marginTop: 100,
          marginBottom: 20,
          borderBottomColor: "black",
          borderBottomWidth: 1,
          justifyContent: "flex-end",
        }}
      >
        {uploadedImageUrl && (
          <Image
            source={{ uri: uploadedImageUrl }}
            style={{
              width: "100%",
              height: 300,
            }}
          />
        )}
        <View
          style={{
            margin: 20,
            justifyContent: "center",
            alignItems: "center",
          }}
        >
          <Button title="Upload Image" onPress={pickImage} />

          {isLoading ? (
            <Text style={{ fontSize: 18, fontWeight: "bold", color: "blue" }}>
              Passport validation is processing...
            </Text>
          ) : (
            <>
              {!mrzIsValid ? (
                <>
                  {uploadedImageUrl ? (
                    <>
                      <Text
                        style={{
                          fontSize: 18,
                          fontWeight: "bold",
                          color: "red",
                        }}
                      >
                        Passport validation failed
                      </Text>
                      <Text
                        style={{
                          fontSize: 18,
                          fontWeight: "bold",
                          color: "red",
                        }}
                      >
                        You have to upload valid document
                      </Text>
                    </>
                  ) : null}
                </>
              ) : (
                <Text
                  style={{ fontSize: 18, fontWeight: "bold", color: "green" }}
                >
                  Passport validation done
                </Text>
              )}
            </>
          )}
        </View>
      </View>
      <View
        style={{
          marginHorizontal: 20,
          flexDirection: "row",
          justifyContent: "space-around",
          gap: 20,
        }}
      >
        <View style={{ flex: 1 }}>
          <>
            <Text>Passport Number</Text>
            <TextInput
              style={{
                height: 40,
                borderColor: "gray",
                borderWidth: 1,
                paddingHorizontal: 10,
                marginTop: 5,
              }}
              value={mrzIsValid ? showPassportNumber : ""}
              editable={false}
            />
          </>
          <>
            <Text>Date of Expiry</Text>
            <TextInput
              style={{
                height: 40,
                borderColor: "gray",
                borderWidth: 1,
                paddingHorizontal: 10,
                marginTop: 5,
              }}
              value={mrzIsValid ? showExpiryDate : ""}
              editable={false}
            />
          </>
        </View>
        <View style={{ flex: 1 }}>
          <Text>NID Number</Text>
          <TextInput
            style={{
              height: 40,
              borderColor: "gray",
              borderWidth: 1,
              paddingHorizontal: 10,
              marginTop: 5,
              width: "100%",
            }}
            value={mrzIsValid ? showPersonalNumber : ""}
            editable={false}
          />
        </View>
      </View>
    </>
  );
}
