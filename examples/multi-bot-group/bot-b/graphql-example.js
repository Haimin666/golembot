// Minimal GraphQL Server Example with Apollo Server

const { ApolloServer, gql } = require('apollo-server');

// Define your schema (type definitions)
const typeDefs = gql`
  type Book {
    id: ID!
    title: String!
    author: String!
    year: Int
  }

  type Query {
    books: [Book]
    book(id: ID!): Book
  }

  type Mutation {
    addBook(title: String!, author: String!, year: Int): Book
  }
`;

// Sample data
const books = [
  { id: '1', title: '1984', author: 'George Orwell', year: 1949 },
  { id: '2', title: 'To Kill a Mockingbird', author: 'Harper Lee', year: 1960 },
];

// Resolvers - functions that return data for each field
const resolvers = {
  Query: {
    // Resolver for fetching all books
    books: () => books,
    
    // Resolver for fetching a single book by ID
    book: (parent, args) => {
      return books.find(book => book.id === args.id);
    },
  },
  
  Mutation: {
    // Resolver for adding a new book
    addBook: (parent, args) => {
      const newBook = {
        id: String(books.length + 1),
        title: args.title,
        author: args.author,
        year: args.year,
      };
      books.push(newBook);
      return newBook;
    },
  },
};

// Create and start the server
const server = new ApolloServer({ typeDefs, resolvers });

server.listen().then(({ url }) => {
  console.log(`🚀 Server ready at ${url}`);
});

/* 
Example queries to test:

# Get all books
query {
  books {
    id
    title
    author
  }
}

# Get a specific book
query {
  book(id: "1") {
    title
    author
    year
  }
}

# Add a new book
mutation {
  addBook(title: "The Great Gatsby", author: "F. Scott Fitzgerald", year: 1925) {
    id
    title
  }
}
*/
