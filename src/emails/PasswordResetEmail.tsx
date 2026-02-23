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

interface PasswordResetEmailProps {
  firstName: string
  resetUrl: string
}

export default function PasswordResetEmail({ firstName, resetUrl }: PasswordResetEmailProps) {
  return (
    <Html>
      <Head />
      <Preview>Reset your BikerOrNot password</Preview>
      <Body style={main}>
        <Container style={container}>
          <Section style={logoSection}>
            <Text style={logoText}>
              Biker<span style={{ color: '#f97316' }}>OrNot</span>
            </Text>
          </Section>

          <Heading style={h1}>Reset your password</Heading>

          <Text style={text}>Hey {firstName},</Text>
          <Text style={text}>
            We received a request to reset the password for your BikerOrNot account. Click the
            button below to choose a new password.
          </Text>

          <Section style={buttonContainer}>
            <Button style={button} href={resetUrl}>
              Reset my password
            </Button>
          </Section>

          <Text style={text}>
            This link expires in <strong style={{ color: '#ffffff' }}>1 hour</strong>. All active
            sessions will be signed out after your password is changed.
          </Text>

          <Text style={text}>
            If you didn&apos;t request a password reset, you can safely ignore this email — your
            password won&apos;t change.
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
