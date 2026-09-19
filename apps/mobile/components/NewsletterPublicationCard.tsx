import { Image, StyleSheet, Text, View } from "react-native";

import { Button } from "./Button";
import type { NewsletterPublication } from "../lib/newsletterFeed";
import {
  color,
  hardShadow,
  radius,
  space,
  type as typePreset,
} from "../theme";

const LOGO_SIZE = 56;

type NewsletterPublicationCardProps = {
  readonly publication: NewsletterPublication;
  readonly onOpenPublication: () => void;
};

// Masthead above the issue list: logo, blurb, and a link to the publication's
// website in the browser. No purchase language: the app sells nothing.
export function NewsletterPublicationCard({
  publication,
  onOpenPublication,
}: NewsletterPublicationCardProps) {
  return (
    <View style={styles.card}>
      <View style={styles.row}>
        {publication.logoUrl ? (
          <Image
            accessibilityIgnoresInvertColors
            source={{ uri: publication.logoUrl }}
            style={styles.logo}
          />
        ) : null}
        <View style={styles.text}>
          <Text style={styles.title}>{publication.title}</Text>
          {publication.description ? (
            <Text style={styles.description}>{publication.description}</Text>
          ) : null}
        </View>
      </View>
      <Button label="Read on Substack" tone="primary" onPress={onOpenPublication} />
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    ...hardShadow,
    alignItems: "flex-start",
    backgroundColor: color.brown400,
    borderColor: color.oreo,
    borderRadius: radius.card,
    borderWidth: 2,
    gap: space.lg,
    padding: space.xl,
    width: "100%",
  },
  row: {
    alignItems: "center",
    flexDirection: "row",
    gap: space.lg,
    width: "100%",
  },
  logo: {
    backgroundColor: color.oreo,
    borderColor: color.oreo,
    borderRadius: radius.image,
    borderWidth: 1,
    height: LOGO_SIZE,
    width: LOGO_SIZE,
  },
  text: {
    flex: 1,
    gap: space.xxs,
  },
  title: {
    ...typePreset.h24Bold,
    color: color.white,
  },
  description: {
    ...typePreset.caption12,
    color: color.khakis,
  },
});
