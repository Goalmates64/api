import { AuthGuard } from '@/auth/auth.guard';
import { CurrentUserSession } from '@/decorators/auth/current-user-session.decorator';
import { UseGuards } from '@nestjs/common';
import {
  Args,
  Mutation,
  Parent,
  Query,
  ResolveField,
  Resolver,
} from '@nestjs/graphql';
import { DeleteUserInput } from './schema/delete-user.schema';
import { GetUserArgs } from './schema/get-user.schema';
import { UserSchema } from './schema/user.schema';
import { UserService } from './user.service';

@UseGuards(AuthGuard)
@Resolver(() => UserSchema)
export class UserResolver {
  constructor(private readonly userService: UserService) {}

  @Query(() => UserSchema)
  async whoami(@CurrentUserSession('user') user: CurrentUserSession['user']) {
    return this.userService.findOneUser(user.id);
  }

  @Query(() => [UserSchema])
  async getUsers() {
    return this.userService.getAllUsers();
  }

  @Query(() => UserSchema)
  async getUser(@Args() { id }: GetUserArgs) {
    return this.userService.findOneUser(id);
  }

  @Mutation(() => UserSchema)
  async deleteUser(@Args('input') userInput: DeleteUserInput) {
    return this.userService.deleteUser(userInput.id);
  }

  @ResolveField(() => UserSchema)
  async self(@Parent() user: UserSchema) {
    return this.userService.findOneUser(user.id);
  }
}
