import {
  Body,
  Button,
  Container,
  Head,
  Heading,
  Hr,
  Html,
  Preview,
  Section,
  Text,
} from '@react-email/components'

interface VerificationEmailProps {
  firstName: string
  verificationUrl: string
}

export default function VerificationEmail({ firstName, verificationUrl }: VerificationEmailProps) {
  return (
    <Html>
      <Head />
      <Preview>Verify your BikerOrNot email address</Preview>
      <Body style={main}>
        <Container style={container}>
          <Section style={logoSection}>
            <Text style={logoText}>
              Biker<span style={{ color: '#f97316' }}>OrNot</span>
            </Text>
          </Section>

          <Heading style={h1}>Verify your email address</Heading>

          <Text style={text}>Hey {firstName},</Text>
          <Text style={text}>
            Thanks for signing up for BikerOrNot — the motorcycle enthusiast network. Click the
            button below to verify your email address and activate your account.
          </Text>

          <Section style={buttonContainer}>
            <Button style={button} href={verificationUrl}>
              Verify my email
            </Button>
          </Section>

          <Text style={text}>
            This link expires in 24 hours. If you didn&apos;t create an account, you can safely
            ignore this email.
          </Text>

          <Hr style={hr} />

          <Text style={footer}>
            BikerOrNot · The motorcycle enthusiast network
          </Text>
        </Container>
      </Body>
    </Html>
  )
}

const main: React.CSSProperties = {
  backgroundColor: '#09090b',
  fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
}

const container: React.CSSProperties = {
  margin: '0 auto',
  padding: '40px 20px',
  maxWidth: '560px',
}

const logoSection: React.CSSProperties = {
  marginBottom: '32px',
}

const logoText: React.CSSProperties = {
  fontSize: '24px',
  fontWeight: '700',
  color: '#ffffff',
  margin: '0',
}

const h1: React.CSSProperties = {
  color: '#ffffff',
  fontSize: '24px',
  fontWeight: '600',
  lineHeight: '1.3',
  margin: '0 0 20px',
}

const text: React.CSSProperties = {
  color: '#a1a1aa',
  fontSize: '15px',
  lineHeight: '1.6',
  margin: '0 0 16px',
}

const buttonContainer: React.CSSProperties = {
  margin: '28px 0',
}

const button: React.CSSProperties = {
  backgroundColor: '#f97316',
  borderRadius: '8px',
  color: '#ffffff',
  fontSize: '15px',
  fontWeight: '600',
  padding: '12px 28px',
  textDecoration: 'none',
  display: 'inline-block',
}

const hr: React.CSSProperties = {
  borderColor: '#27272a',
  margin: '32px 0 20px',
}

const footer: React.CSSProperties = {
  color: '#52525b',
  fontSize: '12px',
  margin: '0',
}
