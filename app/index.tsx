import { router } from "expo-router";
import * as SplashScreen from "expo-splash-screen";
import { useEffect } from "react";
import { Image, StyleSheet, View } from "react-native";

SplashScreen.preventAutoHideAsync();

export default function Index() {
  useEffect(() => {
    const timer = setTimeout(async () => {
      await SplashScreen.hideAsync();
      router.replace("/(auth)/login" as const); // 👈 force correct type
    }, 2000);

    return () => clearTimeout(timer);
  }, []);

  return (
    <View style={styles.container}>
      <Image
        source={require("../assets/images/splash.png")}
        style={styles.image}
        resizeMode="cover"
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#fff" },
  image: { flex: 1, width: "100%", height: "100%" },
});
