package mongo

import (
	"context"
	"fmt"
	"time"

	"go.mongodb.org/mongo-driver/v2/mongo"
	"go.mongodb.org/mongo-driver/v2/mongo/options"
	"go.mongodb.org/mongo-driver/v2/mongo/readpref"
)

// Client 封装 MongoDB 连接
type Client struct {
	cli      *mongo.Client
	Database *mongo.Database
}

// GetClient 获取底层的 mongo.Client
func (c *Client) GetClient() *mongo.Client {
	return c.cli
}

// Connect 建立 MongoDB 连接，uri 为连接串，dbName 为目标数据库名
func Connect(ctx context.Context, uri, dbName string) (*Client, error) {
	ctx, cancel := context.WithTimeout(ctx, 10*time.Second)
	defer cancel()

	cli, err := mongo.Connect(options.Client().ApplyURI(uri))
	if err != nil {
		return nil, fmt.Errorf("mongo connect: %w", err)
	}

	if err := cli.Ping(ctx, readpref.Primary()); err != nil {
		return nil, fmt.Errorf("mongo ping: %w", err)
	}

	return &Client{
		cli:      cli,
		Database: cli.Database(dbName),
	}, nil
}

// Close 断开连接
func (c *Client) Close(ctx context.Context) error {
	return c.cli.Disconnect(ctx)
}

// Ping 检查 MongoDB 连接状态
func (c *Client) Ping(ctx context.Context) error {
	return c.cli.Ping(ctx, readpref.Primary())
}
