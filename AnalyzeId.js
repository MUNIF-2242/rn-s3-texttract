import React, { useEffect, useState } from "react";
import { View, Button, Alert, Image, Text, TextInput } from "react-native";
import * as ImagePicker from "expo-image-picker";
import { S3, Textract } from "aws-sdk/dist/aws-sdk-react-native";

const AnalyzeId = () => {
  console.log("App started");

  const [uploadedImageUrl, setUploadedImageUrl] = useState(null);
  const [showPassportNumber, setShowPassportNumber] = useState(null);
  const [showPersonalNumber, setShowPersonalNumber] = useState(null);
  const [showExpiryDate, setShowExpiryDate] = useState(null);
  const [mrzIsValid, setMrzIsValid] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [mrzCode, setMrzCode] = useState(null);

  useEffect(() => {
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
    region: process.env.EXPO_PUBLIC_AWS_REGION,
    credentials: {
      accessKeyId: process.env.EXPO_PUBLIC_AWS_ACCESS_KEY,
      secretAccessKey: process.env.EXPO_PUBLIC_AWS_SECRET_ACCESS_KEY,
    },
  });

  const textract = new Textract({
    region: process.env.EXPO_PUBLIC_AWS_REGION,
    credentials: {
      accessKeyId: process.env.EXPO_PUBLIC_AWS_ACCESS_KEY,
      secretAccessKey: process.env.EXPO_PUBLIC_AWS_SECRET_ACCESS_KEY,
    },
  });

  const uploadImageToS3 = async (fileUri, fileName) => {
    try {
      setIsLoading(true);
      if (!fileUri) {
        throw new Error("File URI is undefined or null.");
      }

      const fileType = fileUri.split(".").pop();
      const response = await fetch(fileUri);
      const blob = await response.blob();

      const params = {
        Bucket: process.env.EXPO_PUBLIC_AWS_BUCKET_NAME,
        Key: fileName,
        ContentType: `image/${fileType}`,
        Body: blob,
      };

      const data = await s3.upload(params).promise();
      console.log("Upload successful:", data.Location);

      setUploadedImageUrl(data.Location);

      await analyzeID(data.Location);
    } catch (error) {
      console.error("Upload error:", error);
      Alert.alert("Upload failed", "Failed to upload image to S3.");
    } finally {
      setIsLoading(false);
    }
  };

  const analyzeID = async (imageUrl) => {
    const params = {
      DocumentPages: [
        {
          S3Object: {
            Bucket: process.env.EXPO_PUBLIC_AWS_BUCKET_NAME,
            Name: imageUrl.split("/").pop(),
          },
        },
      ],
    };

    try {
      const response = await textract.analyzeID(params).promise();

      const identityDocumentFields =
        response.IdentityDocuments[0].IdentityDocumentFields;

      let MRZ_CODE =
        "P<BGDHASAN<<MD<MUNIF<<<<<<<<<<<<<<<<<<<<<<<<\nA055835530BGD9112229M27110696445180877<<<<44";

      for (let field of identityDocumentFields) {
        if (field.Type.Text === "MRZ_CODE") {
          mrzCode = field.ValueDetection.Text;
          break; // Exit the loop once the MRZ_CODE is found
        }
      }
      console.log("mrzCode" + mrzCode);
    } catch (error) {
      console.error("Textract error:", error);
      Alert.alert("Textract failed", "Failed to extract text from the image.");
    } finally {
      setIsLoading(false);
    }
  };
  console.log(mrzCode);
  const pickImage = async () => {
    try {
      let result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.Images,
        allowsEditing: true,
        aspect: [4, 3],
        quality: 1,
      });

      if (!result.assets[0].cancelled) {
        const uri = result.assets[0].uri;
        const fileName = `image-${Date.now()}.jpg`;
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
            style={{ width: "100%", height: 300 }}
          />
        )}
        <View
          style={{ margin: 20, justifyContent: "center", alignItems: "center" }}
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
                        You have to upload a valid document
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
};

export default AnalyzeId;
