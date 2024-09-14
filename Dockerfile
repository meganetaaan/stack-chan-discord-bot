FROM oven/bun:1.1.27

# Set the working directory inside the container
WORKDIR /app

# Copy package.json and bun.lockb to the working directory
COPY package.json bun.lockb ./

# Install dependencies using Bun
RUN bun install

# Copy the rest of your application code to the working directory
COPY . .

# Set the command to run your application
CMD ["bun", "run", "src/index.ts"]
