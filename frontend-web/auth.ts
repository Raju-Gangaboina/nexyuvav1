import NextAuth from 'next-auth';
import Google from 'next-auth/providers/google';

export const { handlers, signIn, signOut, auth } = NextAuth({
  providers: [
    Google({
      clientId: process.env.GOOGLE_CLIENT_ID!,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET!,
    }),
  ],
  pages: {
    signIn: '/login',
    error: '/login',
  },
  callbacks: {
    async session({ session, token }) {
      // When backend is ready, attach user role, id etc here
      // e.g. session.user.role = token.role
      return session;
    },
    async jwt({ token, account, profile }) {
      // Persist Google profile info to token
      if (account) {
        token.accessToken = account.access_token;
      }
      return token;
    },
  },
});
