import { beforeAll, describe, expect, it } from "vitest";
import { SignJWT, createLocalJWKSet, exportJWK, generateKeyPair, type JWK } from "jose";
import { verifyAccessToken, type AccessKeySet } from "./access-jwt";

const TEAM = "anchor.cloudflareaccess.com";
const AUD = "aud-tag-123";
const KID = "test-key";

let rsaPrivate: CryptoKey;
let ecPrivate: CryptoKey;
let keySet: AccessKeySet;

beforeAll(async () => {
  const rsa = await generateKeyPair("RS256", { extractable: true });
  rsaPrivate = rsa.privateKey;
  const ec = await generateKeyPair("ES256", { extractable: true });
  const rsaJwk: JWK = { ...(await exportJWK(rsa.publicKey)), kid: KID, alg: "RS256" };
  // An EC key under its own kid, without an alg pin, to prove the algorithm allow-list rejects it.
  const ecJwk: JWK = { ...(await exportJWK(ec.publicKey)), kid: "ec-key" };
  keySet = createLocalJWKSet({ keys: [rsaJwk, ecJwk] });
  ecPrivate = ec.privateKey;
});

interface TokenOptions {
  claims?: Record<string, unknown>;
  issuer?: string;
  audience?: string;
  expiresIn?: string | number;
}

function sign({ claims = { email: "Taro@Example.com", sub: "user-1" }, issuer, audience, expiresIn }: TokenOptions = {}) {
  return new SignJWT(claims)
    .setProtectedHeader({ alg: "RS256", kid: KID })
    .setIssuer(issuer ?? `https://${TEAM}`)
    .setAudience(audience ?? AUD)
    .setIssuedAt()
    .setExpirationTime(expiresIn ?? "5m")
    .sign(rsaPrivate);
}

const opts = () => ({ teamDomain: TEAM, audience: AUD, keySet });

describe("verifyAccessToken", () => {
  it("returns the normalized email and sub for a valid token", async () => {
    const token = await sign();
    await expect(verifyAccessToken(token, opts())).resolves.toEqual({ email: "taro@example.com", sub: "user-1" });
  });

  it("rejects a token from another team (issuer)", async () => {
    const token = await sign({ issuer: "https://other.cloudflareaccess.com" });
    await expect(verifyAccessToken(token, opts())).rejects.toThrow();
  });

  it("rejects a token for another Access application (audience)", async () => {
    const token = await sign({ audience: "other-aud" });
    await expect(verifyAccessToken(token, opts())).rejects.toThrow();
  });

  it("rejects an expired token", async () => {
    const token = await sign({ expiresIn: Math.floor(Date.now() / 1000) - 60 });
    await expect(verifyAccessToken(token, opts())).rejects.toThrow();
  });

  it("rejects a token without an email claim", async () => {
    const token = await sign({ claims: { sub: "user-1" } });
    await expect(verifyAccessToken(token, opts())).rejects.toThrow(/email/);
  });

  it("rejects a token without a sub claim", async () => {
    const token = await sign({ claims: { email: "taro@example.com" } });
    await expect(verifyAccessToken(token, opts())).rejects.toThrow(/sub/);
  });

  it("rejects algorithms other than RS256", async () => {
    const token = await new SignJWT({ email: "taro@example.com", sub: "user-1" })
      .setProtectedHeader({ alg: "ES256", kid: "ec-key" })
      .setIssuer(`https://${TEAM}`)
      .setAudience(AUD)
      .setExpirationTime("5m")
      .sign(ecPrivate);
    await expect(verifyAccessToken(token, opts())).rejects.toThrow();
  });

  it("rejects a tampered signature", async () => {
    const token = await sign();
    const [h, p, s] = token.split(".");
    const flipped = (s[0] === "A" ? "B" : "A") + s.slice(1);
    await expect(verifyAccessToken(`${h}.${p}.${flipped}`, opts())).rejects.toThrow();
  });
});
